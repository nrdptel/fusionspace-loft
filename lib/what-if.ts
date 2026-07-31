/** How a what-if field talks about a value it will not fly.
 *
 *  There are two of these fields, in two files — the design editor's (`Num` in `LoftApp.tsx`) and
 *  the analysis panels' (`NumberField` in `components/ui.tsx`) — and they ask the flyer for the
 *  same thing in the same gesture. A flyer who learns what a refused entry looks like in one has
 *  learned it in both, so the sentence lives here rather than being written twice and drifting.
 *
 *  The complaint a refused entry answers is not "that was rejected". It is "then what is being
 *  flown?" — so naming the value actually in the flight is the load-bearing half of the message. */

/** A field's range in words. A bound the field doesn't have is SAID, not left as a dash: most of
 *  these are floored at zero and open above, and "0 to –" reads as a range that failed to load.
 *
 *  `minExclusive` is the difference between "0 or more" and "more than 0". A body tube of no
 *  diameter and a fin of no thickness are not small values, they are absent parts, and a field whose
 *  range reads "0 or more" has told the flyer that zero is one of the answers it takes. The wording
 *  also carries the refusal: `refusedMessage` quotes this string back when an entry is turned down,
 *  which for these fields is the only place the range is ever said out loud — the field's tooltip
 *  shows its `hint` instead wherever it has one. */
export function rangeWords(min?: number, max?: number, minExclusive?: boolean): string | undefined {
  if (min !== undefined && max !== undefined)
    return minExclusive ? `more than ${min}, up to ${max}` : `${min} to ${max}`;
  if (min !== undefined) return minExclusive ? `more than ${min}` : `${min} or more`;
  if (max !== undefined) return `up to ${max}`;
  return undefined;
}

/** What to say about an entry the field will not fly.
 *
 *  @param entry  the text the flyer typed, repeated back so they can see it was read
 *  @param ranged what the field will take, from `rangeWords`
 *  @param flown  the value the flight is using instead — omitted only when there is nothing to name */
export function refusedMessage(entry: string, ranged?: string, flown?: string): string {
  return `${entry} isn't a value this can fly${ranged ? ` (${ranged})` : ""}${flown ? ` — flying ${flown}` : ""}.`;
}

/** A list of field names as a sentence reads it: "a", "a and b", "a, b, and c". Comma-joining alone
 *  produced "no rail length, rail angle, surface wind, field elevation", which reads as a truncated
 *  list rather than a complete one — and the sentence it sits in is telling a flyer which of their
 *  launch numbers their file did not supply, so being read as truncated is the wrong failure. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Where the launch conditions a panel flew actually came from.
 *
 *  One boolean was not enough, and the two ways it was wrong point in opposite directions. The two
 *  sweeps fly BALLISTIC — `runFlight` zeroes the wind for a ballistic run — so a surface-wind edit
 *  flipped their captions to "the launch conditions you set" while every row was bit-identical: a
 *  claim about the numbers that the numbers did not support. And a fetched forecast counted as
 *  "you set", when `onWeather` deliberately CLEARS the two edits it overrides and the panel greys
 *  both fields: the flyer set none of it. Each panel asks only about the fields it reads. */
export interface ConditionsSource {
  /** The flyer set a rail length or a rail angle. */
  railEdited: boolean;
  /** The flyer set a field elevation. */
  elevationEdited: boolean;
  /** The flyer set a surface wind. A ballistic panel does not read this. */
  windEdited: boolean;
  /** Today's weather is supplying the air, the elevation and a wind profile. */
  today: boolean;
  /** The local hour that wind profile is FOR (`18:00`), and whether it could be tied to the surface
   *  reading's own timestamp.
   *
   *  A drift figure is only as current as the wind above the pad, and the profile is one hour of a
   *  24-hour forecast day while the surface block is live. Stating the hour only on the Conditions
   *  card was not enough: that card is a collapsed `<details>`, and "Drift from pad", the Monte-Carlo
   *  recovery radius and the median drift are all read with it shut. It rides on `ConditionsSource`
   *  because that is already the one funnel every panel describes its nominals through, so a panel
   *  cannot present the drift and omit the hour by forgetting to. */
  aloftHour?: string;
  aloftMatched?: boolean;
  /** The design specifies no launch setup at all, so the rest are Loft's own defaults — which the
   *  Conditions panel already says in amber, so a panel claiming "the design's own stored launch
   *  conditions" contradicts it a screen away. */
  defaulted: boolean;
}

/** What a panel should say about the nominals it flew.
 *
 *  @param src   where each condition came from
 *  @param reads which of them this panel actually reads — a ballistic panel does not read the wind */
export function conditionsPhrase(
  src: ConditionsSource | undefined,
  reads: { wind: boolean },
): string {
  if (!src) return "the design's stored launch conditions";
  const edited = src.railEdited || src.elevationEdited || (reads.wind && src.windEdited);
  // Only a panel that READS the wind is affected by which hour the profile is for; a ballistic one
  // flies no wind at all, so naming the hour there would be a caveat about nothing.
  const today = reads.wind ? `today's weather at your site${aloftWords(src)}` : "today's weather at your site";
  if (edited && src.today) return `the launch conditions you set, over ${today}`;
  if (edited) return "the launch conditions you set";
  if (src.today) return today;
  if (src.defaulted) return "Loft's own default launch conditions — this design states none";
  return "the design's stored launch conditions";
}

/** How to name the hour the winds-aloft profile is for, in the middle of a sentence.
 *
 *  Empty when there is nothing to say — no profile hour on the record — so the phrase reads exactly as
 *  it did before rather than trailing an empty clause. */
function aloftWords(src: ConditionsSource): string {
  if (!src.today || !src.aloftHour) return "";
  const hhmm = src.aloftHour.length > 5 ? src.aloftHour.slice(11) : src.aloftHour;
  return src.aloftMatched
    ? ` (winds aloft for ${hhmm} local)`
    : ` (winds aloft for ${hhmm} local, which the forecast gave no way to tie to the surface reading)`;
}
