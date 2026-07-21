#!/usr/bin/env python3
"""Dev-only cross-validation harness (part 2 of 2): read the specs emitted by emit.ts, fly each
design in RocketPy (an independent MIT-licensed 6-DOF engine), and diff its ascent metrics
against Loft's own result (and OpenRocket's stored result when present).

NOT shipped and NOT in CI — needs Python + RocketPy in a venv. See README.md.

Scope (first cut): single-stage, ascent to apogee (terminate_on_apogee). RocketPy is fed Loft's
own Cd(Mach) curve — so this checks the integrator, the mass model, and RocketPy's independent
Barrowman CP, holding drag equal. It is NOT an independent drag oracle (that's OpenRocket-stored).
"""

import json
import sys
from importlib.metadata import version, PackageNotFoundError
from pathlib import Path

# fly(spec) is shared with the in-browser Pyodide runner (scripts/rocketpy/pyodide/), so native
# and WASM RocketPy fly identically. Support being run as a script (python run_rocketpy.py).
sys.path.insert(0, str(Path(__file__).parent))
from fly import fly  # noqa: E402

OUT = Path(__file__).parent / "out"
# The committed reference the app's Validation page reads. Only the bundled demo designs go in it.
REFERENCE = Path(__file__).parent / "../../fixtures/rocketpy-cross-check.json"


def rocketpy_version():
    try:
        return version("rocketpy")
    except PackageNotFoundError:
        return "unknown"


def pct(a, b):
    return f"{(a - b) / b * 100:+.1f}%" if b else "  n/a"


def main():
    bases = sorted({p.name[: -len(".spec.json")] for p in OUT.glob("*.spec.json")})
    if not bases:
        print("no specs in", OUT, "— run emit.ts first"); sys.exit(1)
    print(f"{'design':<22}{'metric':<16}{'Loft':>10}{'RocketPy':>10}{'OR stored':>11}{'L−RPy':>8}")
    print("-" * 79)
    reference_designs = []
    for base in bases:
        spec = json.load(open(OUT / f"{base}.spec.json"))
        ld = json.load(open(OUT / f"{base}.loft.json"))
        loft, stored = ld["loft"], ld.get("stored")
        real_apogee = ld.get("realApogee")
        try:
            # descent=True flies on past apogee under an equivalent canopy (Cd·A from the spec) when
            # the design has recovery, adding landing speed/energy; ascent metrics are unchanged.
            rp = fly(spec, descent=True)
        except Exception as ex:  # noqa: BLE001
            print(f"{base:<22}RocketPy ERROR: {type(ex).__name__}: {str(ex)[:60]}")
            continue
        # Loft vs RocketPy: both ballistic (no recovery, no wind), so the L−RPy column is a clean
        # ascent-physics diff. OR-stored is a *real* flight (recovery + wind), shown for context.
        rows = [
            ("apogee (m)", loft["apogee"], rp["apogee"], (stored or {}).get("apogee")),
            ("max vel (m/s)", loft["maxVelocity"], rp["maxVelocity"], (stored or {}).get("maxVelocity")),
            ("max Mach", loft["maxMach"], rp["maxMach"], None),
            ("t apogee (s)", loft["timeToApogee"], rp["timeToApogee"], None),
            ("rail exit (m/s)", loft["railExitVelocity"], rp["railExitVelocity"], None),
        ]
        for i, (label, lv, rv, sv) in enumerate(rows):
            name = f"{base}" if i == 0 else ""
            svs = f"{sv:>11.1f}" if sv is not None else f"{'-':>11}"
            print(f"{name:<22}{label:<16}{lv:>10.2f}{rv:>10.2f}{svs}{pct(lv, rv):>8}")
        print(f"{'':<22}{'margin (cal)':<16}{loft['staticMarginCal']:>10.2f}{rp['staticMarginLiftoff']:>10.2f}{'-':>11}{'':>8}")
        # Descent cross-check: both engines settle to terminal under the same landing Cd·A with wind
        # zeroed, so this diffs the descent integrator and the burnout-mass model (drag held equal).
        if "landingSpeed" in rp and loft.get("landingSpeed") is not None:
            print(f"{'':<22}{'landing (m/s)':<16}{loft['landingSpeed']:>10.2f}{rp['landingSpeed']:>10.2f}{'-':>11}{pct(loft['landingSpeed'], rp['landingSpeed']):>8}")
            print(f"{'':<22}{'land KE (J)':<16}{loft['landingEnergy']:>10.2f}{rp['landingEnergy']:>10.2f}{'-':>11}{pct(loft['landingEnergy'], rp['landingEnergy']):>8}")
        # Note the real (recovery-flown) apogee when it differs from ballistic — an early ejection.
        if real_apogee is not None and abs(real_apogee - loft["apogee"]) > 0.5:
            print(f"{'':<22}{'  (real w/ chute)':<16}{real_apogee:>10.2f}{'':>10}{'':>11}   early deploy")
        print("-" * 79)

        # Bundled demo designs become the committed reference the Validation page shows to users.
        if ld.get("bundled"):
            entry = {
                "key": ld["key"],
                "config": ld.get("config", ""),
                "name": ld.get("name", ""),
                "apogee": round(rp["apogee"], 1),
                "maxVelocity": round(rp["maxVelocity"], 1),
                "maxMach": round(rp["maxMach"], 3),
                "timeToApogee": round(rp["timeToApogee"], 2),
                "railExitVelocity": round(rp["railExitVelocity"], 1),
                "staticMargin": round(rp["staticMarginLiftoff"], 2),
            }
            # Landing metrics only for designs that carry recovery (chute-less designs fall ballistic).
            if "landingSpeed" in rp:
                entry["landingSpeed"] = round(rp["landingSpeed"], 2)
                entry["landingEnergy"] = round(rp["landingEnergy"], 1)
            reference_designs.append(entry)

    if reference_designs:
        reference_designs.sort(key=lambda d: d["apogee"])
        out = {
            "engine": "RocketPy",
            "engineVersion": rocketpy_version(),
            "method": (
                "Ballistic ascent to apogee (recovery stripped, wind zeroed). RocketPy is fed "
                "Loft's own Cd(Mach) curve — it does not derive drag from geometry — so this "
                "cross-checks the trajectory integrator, the mass model, and RocketPy's "
                "independent Barrowman centre of pressure, holding drag equal. It is not an "
                "independent drag oracle. Designs with recovery add a descent cross-check: both "
                "engines fly to the ground under the same landing drag area (Cd·A) with wind "
                "zeroed, so the landing speed and energy check the descent integrator and the "
                "burnout-mass model, again holding the drag area equal."
            ),
            "generatedBy": "scripts/rocketpy (offline; RocketPy is not bundled and does not run in the browser)",
            "designs": reference_designs,
        }
        REFERENCE.resolve().write_text(json.dumps(out, indent=2) + "\n")
        print(f"wrote {len(reference_designs)} design(s) to {REFERENCE.resolve()}")


if __name__ == "__main__":
    main()
