import { describe, it, expect } from "vitest";
import { aloftIndexForNow, buildForecastUrl, lerpBearing, parseForecast } from "./weather";

/** `lib/weather.ts` had NO tests, which is most of why it carried two defects that both corrupt the
 *  same number — the wind a flight is flown through, and therefore the drift and the landing point a
 *  flyer walks to. Neither is visible from the solver's side: the profile is a function handed to the
 *  simulator, so every flight was internally consistent and simply described the wrong day.
 */

/** One hour of a response shaped the way Open-Meteo actually returns it: a live `current` block and a
 *  24-entry `hourly` day, both stamped in the launch site's own local time by `timezone=auto`. */
function response({
  currentTime,
  hours = 24,
  aloftAt,
}: {
  currentTime?: string;
  hours?: number;
  /** speed/direction per hourly index, so a test can tell which index was actually read. */
  aloftAt: (i: number) => { spd: number; dir: number; gph: number };
}) {
  const time = Array.from({ length: hours }, (_, i) => `2026-07-30T${String(i).padStart(2, "0")}:00`);
  const hourly: Record<string, unknown> = { time };
  // One level is enough to identify the index; the profile's shape is exercised separately below.
  hourly["wind_speed_850hPa"] = time.map((_, i) => aloftAt(i).spd);
  hourly["wind_direction_850hPa"] = time.map((_, i) => aloftAt(i).dir);
  hourly["geopotential_height_850hPa"] = time.map((_, i) => aloftAt(i).gph);
  return {
    elevation: 1200,
    current: {
      time: currentTime,
      temperature_2m: 28,
      surface_pressure: 880,
      wind_speed_10m: 3,
      wind_direction_10m: 200,
    },
    hourly,
  };
}

describe("aloftIndexForNow — the profile is the hour the surface reading is from", () => {
  const times = Array.from({ length: 24 }, (_, i) => `2026-07-30T${String(i).padStart(2, "0")}:00`);

  it("picks the index matching the current hour, not index 0", () => {
    // The defect, stated as an assertion. Measured against the live API at 18:15 local on 2026-07-30:
    // index 0 is 00:00 and carried a wind 154° away from the hour actually in progress.
    expect(aloftIndexForNow(times, "2026-07-30T18:15")).toEqual({
      index: 18,
      time: "2026-07-30T18:00",
      matched: true,
    });
    expect(aloftIndexForNow(times, "2026-07-30T00:30")).toEqual({
      index: 0,
      time: "2026-07-30T00:00",
      matched: true,
    });
    expect(aloftIndexForNow(times, "2026-07-30T23:59")).toEqual({
      index: 23,
      time: "2026-07-30T23:00",
      matched: true,
    });
  });

  it("matches on the hour, ignoring the minutes the current block reports", () => {
    // `current.time` is stamped at the observation minute and `hourly.time` is always on the hour, so
    // an equality test on the whole string would never match and would silently take the fallback.
    for (const m of ["00", "01", "29", "59"]) {
      expect(aloftIndexForNow(times, `2026-07-30T09:${m}`).index).toBe(9);
    }
  });

  it("marks the fallback UNMATCHED rather than passing it off as the hour", () => {
    // Index 0 is what the defect did and it is the worst available answer, but the last entry is not
    // a better guess either — with `forecast_days=1` it is the furthest-FUTURE forecast, up to 23
    // hours ahead. What makes the fallback acceptable is `matched: false`, which every surface that
    // quotes a drift number is required to say out loud.
    expect(aloftIndexForNow(times, "2026-07-31T04:00")).toEqual({
      index: 23,
      time: "2026-07-30T23:00",
      matched: false,
    });
    expect(aloftIndexForNow(times, undefined)).toEqual({
      index: 23,
      time: "2026-07-30T23:00",
      matched: false,
    });
  });

  it("says nothing about the hour when the response carried no times at all", () => {
    expect(aloftIndexForNow(undefined, "2026-07-30T18:15")).toEqual({ index: 0, matched: false });
    expect(aloftIndexForNow([], "2026-07-30T18:15")).toEqual({ index: 0, matched: false });
    // A non-string entry is not a stamp; it must not be counted as one.
    expect(aloftIndexForNow([1, 2, 3], "2026-07-30T18:15")).toEqual({ index: 0, matched: false });
  });
});

describe("lerpBearing — a compass bearing interpolates the short way round", () => {
  it("takes the short arc across north, where a plain lerp reverses the wind", () => {
    // 350° and 10° are 20° apart. A straight `a + (b - a) * f` gives 180° at the midpoint — the wind
    // exactly reversed, from due south where it blows from due north, at full strength.
    expect(lerpBearing(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpBearing(350, 10, 0.25)).toBeCloseTo(355, 6);
    expect(lerpBearing(350, 10, 0.75)).toBeCloseTo(5, 6);
    // ...and the same the other way.
    expect(lerpBearing(10, 350, 0.5)).toBeCloseTo(0, 6);
  });

  it("is unchanged from the plain interpolation when the pair does not straddle north", () => {
    expect(lerpBearing(100, 140, 0.5)).toBeCloseTo(120, 6);
    expect(lerpBearing(200, 260, 0.25)).toBeCloseTo(215, 6);
  });

  it("returns a bearing in [0, 360) at both endpoints and everywhere between", () => {
    for (const [a, b] of [[350, 10], [10, 350], [0, 180], [180, 0], [359, 1], [90, 270]]) {
      for (const f of [0, 0.1, 0.5, 0.9, 1]) {
        const v = lerpBearing(a, b, f);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(360);
      }
    }
    expect(lerpBearing(350, 10, 0)).toBeCloseTo(350, 6);
    expect(lerpBearing(350, 10, 1)).toBeCloseTo(10, 6);
  });

  it("resolves an exact half-turn the SAME way every time, and says which way", () => {
    // 90° to 270° is 180° either way, so there is no shorter arc to prefer — only a stable choice to
    // make. It goes the −180 side, which means the midpoint depends on which bearing is `from`. Both
    // midpoints are asserted, because the property that matters is determinism: a later rewrite that
    // rounded the other way would change a flown wind with nothing else noticing.
    expect(lerpBearing(90, 270, 0.5)).toBeCloseTo(0, 6);   // NOT 180
    expect(lerpBearing(270, 90, 0.5)).toBeCloseTo(180, 6); // NOT 0
    expect(lerpBearing(0, 180, 0.5)).toBeCloseTo(270, 6);
    expect(lerpBearing(180, 0, 0.5)).toBeCloseTo(90, 6);
    // ...and both ends still land where they should, without the caller having to reduce them.
    expect(lerpBearing(90, 270, 0)).toBeCloseTo(90, 6);
    expect(lerpBearing(90, 270, 1)).toBeCloseTo(270, 6);
  });

  it("keeps the difference inside [-180, 180), which is what makes the short arc short", () => {
    // The interval is half-open at the TOP — brute-forced over every integer pair, the difference runs
    // -180 to 179. It is asserted because the fix's own comment quotes it, and a number in a comment
    // that nobody can re-derive is how this repo defines a defect.
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a < 360; a++) {
      for (let b = 0; b < 360; b++) {
        const d = ((((b - a) % 360) + 540) % 360) - 180;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
        // The identity the interpolation rests on: stepping the whole difference lands on `b`.
        expect(lerpBearing(a, b, 1)).toBeCloseTo(b, 6);
      }
    }
    expect([lo, hi]).toEqual([-180, 179]);
  });

  it("handles a bearing outside [0, 360) rather than propagating it", () => {
    // Nothing in the parser normalises what the API returns, so a -10° or a 370° would flow straight
    // in. Both must behave as the bearing they are.
    expect(lerpBearing(-10, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpBearing(350, 370, 0.5)).toBeCloseTo(0, 6);
    expect(lerpBearing(720 + 350, 10, 0.5)).toBeCloseTo(0, 6);
  });
});

describe("parseForecast — the flight is flown on the hour the flyer is standing in", () => {
  it("reads the aloft profile at the current hour and says which hour that was", () => {
    // Direction encodes the index, so the assertion names the hour that was actually read.
    const raw = response({
      currentTime: "2026-07-30T18:15",
      aloftAt: (i) => ({ spd: i, dir: i * 10, gph: 1500 }),
    });
    const wx = parseForecast(raw, 32.9, -106.9, "Pad");
    expect(wx.aloft).toHaveLength(1);
    expect(wx.aloft[0].windMps).toBe(18);
    expect(wx.aloft[0].windDirDeg).toBe(180);
    expect(wx.aloftTime).toBe("2026-07-30T18:00");
    // The surface block is still the live one, unchanged by any of this.
    expect(wx.surfaceWindMps).toBe(3);
    expect(wx.surfaceWindDirDeg).toBe(200);
  });

  it("keeps the index aligned with the wind arrays when a stamp is malformed", () => {
    // The index returned here is used against `wind_speed_*hPa` and `geopotential_height_*hPa`, so it
    // must be an index into the ORIGINAL array. Filtering the bad entry out first — the obvious way to
    // write this — slides every later hour's wind one place, and the panel then prints a confident
    // "for 18:00 local" over the 17:00 wind. That is worse than the defect being fixed, which at least
    // did not lie about the hour.
    const times: unknown[] = Array.from({ length: 24 }, (_, i) => `2026-07-30T${String(i).padStart(2, "0")}:00`);
    times[3] = null;
    expect(aloftIndexForNow(times, "2026-07-30T18:15")).toEqual({
      index: 18,
      time: "2026-07-30T18:00",
      matched: true,
    });
  });

  it("says when the hour could NOT be tied to the surface reading", () => {
    // The fallback is not a quiet second guess. `matched: false` is what makes every panel quoting a
    // drift number say the profile might beize most of a day away from the air at the pad.
    const raw = response({ currentTime: undefined, aloftAt: (i) => ({ spd: i, dir: i * 10, gph: 1500 }) });
    const wx = parseForecast(raw, 32.9, -106.9);
    expect(wx.aloftMatched).toBe(false);
    expect(wx.aloftTime).toBe("2026-07-30T23:00");

    const matched = parseForecast(
      response({ currentTime: "2026-07-30T18:15", aloftAt: (i) => ({ spd: i, dir: i * 10, gph: 1500 }) }),
      32.9,
      -106.9,
    );
    expect(matched.aloftMatched).toBe(true);
  });

  it("flies the profile the SHORT way between two levels that straddle north", () => {
    // The end-to-end version of the `lerpBearing` unit test: build a real two-level profile and
    // sample the wind vector halfway between them. Air moves TOWARD dir+180, so a wind from 000°
    // blows toward 180° — the vector's x component must be negative, and a reversed interpolation
    // would put it positive.
    const time = ["2026-07-30T12:00"];
    const raw = {
      elevation: 0,
      current: { time: "2026-07-30T12:10", temperature_2m: 15, surface_pressure: 1013.25, wind_speed_10m: 0, wind_direction_10m: 0 },
      hourly: {
        time,
        wind_speed_1000hPa: [10],
        wind_direction_1000hPa: [350],
        geopotential_height_1000hPa: [100],
        wind_speed_975hPa: [10],
        wind_direction_975hPa: [10],
        geopotential_height_975hPa: [1100],
      },
    };
    const wx = parseForecast(raw, 0, 0);
    expect(wx.aloft.map((l) => l.altitudeMsl)).toEqual([100, 1100]);
    const mid = wx.windProfile(600); // halfway: the true bearing is 000°
    // From 000° → toward 180° → the x component is -10 and y ~ 0.
    expect(mid.x).toBeCloseTo(-10, 6);
    expect(mid.y).toBeCloseTo(0, 6);
    // The unfixed interpolation gives 180°, i.e. air moving toward 000°: x = +10. Explicitly not that.
    expect(mid.x).toBeLessThan(0);
  });

  it("still parses a response that states no hour, and says the hour is unknown", () => {
    const raw = {
      elevation: 0,
      current: { temperature_2m: 15, surface_pressure: 1013.25, wind_speed_10m: 4, wind_direction_10m: 90 },
      hourly: { wind_speed_850hPa: [7], wind_direction_850hPa: [270], geopotential_height_850hPa: [1500] },
    };
    const wx = parseForecast(raw, 0, 0);
    expect(wx.aloftTime).toBeUndefined();
    expect(wx.aloft[0].windMps).toBe(7);
  });

  it("asks the API for the fields this all depends on", () => {
    // A denominator for everything above: none of it means anything if the request stops returning a
    // current block or an hourly day.
    const url = buildForecastUrl(32.9, -106.9);
    expect(url).toContain("timezone=auto");
    expect(url).toContain("forecast_days=1");
    expect(url).toContain("current=temperature_2m");
    expect(url).toContain("wind_speed_850hPa");
  });
});
