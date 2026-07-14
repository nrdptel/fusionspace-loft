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
from pathlib import Path

from rocketpy import Environment, GenericMotor, Rocket, Flight

OUT = Path(__file__).parent / "out"


def fly(spec):
    e, r, m = spec["environment"], spec["rocket"], spec["motor"]

    env = Environment(latitude=0.0, longitude=0.0, elevation=e["elevation"])
    # Zero-wind ISA anchored at the field elevation: isolates the integrator/drag/mass check.
    env.set_atmospheric_model(type="standard_atmosphere")

    dry = max(m["dryMass"], 1e-6)
    motor = GenericMotor(
        thrust_source=[[float(t), float(f)] for t, f in m["thrust"]],
        burn_time=m["burnTime"],
        chamber_radius=m["diameter"] / 2,
        chamber_height=max(m["length"], 1e-3),
        chamber_position=m["length"] / 2,
        propellant_initial_mass=m["propMass"],
        nozzle_radius=m["diameter"] / 2 * 0.5,
        dry_mass=dry,
        center_of_dry_mass_position=m["length"] / 2,
        dry_inertia=(dry * m["length"] ** 2 / 12, dry * m["length"] ** 2 / 12, dry * (m["diameter"] / 2) ** 2 / 2),
    )

    rocket = Rocket(
        radius=r["radius"],
        mass=r["mass"],
        inertia=tuple(r["inertia"]),
        power_off_drag=[[float(mach), float(cd)] for mach, cd in r["cdPowerOff"]],
        power_on_drag=[[float(mach), float(cd)] for mach, cd in r["cdPowerOn"]],
        center_of_mass_without_motor=r["cgNoMotor"],
        coordinate_system_orientation="nose_to_tail",
    )
    rocket.add_motor(motor, position=m["position"])
    if r["nose"]:
        n = r["nose"]
        rocket.add_nose(length=n["length"], kind=n["kind"], position=n["position"], base_radius=n["baseRadius"])
    for t in r["tails"]:
        rocket.add_tail(top_radius=t["topRadius"], bottom_radius=t["bottomRadius"], length=t["length"], position=t["position"])
    for f in r["fins"]:
        if f["kind"] == "elliptical":
            rocket.add_elliptical_fins(n=f["n"], root_chord=f["rootChord"], span=f["span"], position=f["position"], radius=f["radius"])
        else:
            rocket.add_trapezoidal_fins(
                n=f["n"], root_chord=f["rootChord"], tip_chord=f["tipChord"], span=f["span"],
                position=f["position"], sweep_length=f["sweepLength"], radius=f["radius"],
            )

    flight = Flight(
        rocket=rocket, environment=env, rail_length=e["railLength"],
        inclination=e["inclinationDeg"], heading=e["headingDeg"],
        terminate_on_apogee=True, max_time=120,
    )
    return {
        "apogee": float(flight.apogee) - e["elevation"],
        "maxVelocity": float(flight.max_speed),
        "maxMach": float(flight.max_mach_number),
        "timeToApogee": float(flight.apogee_time),
        "railExitVelocity": float(flight.out_of_rail_velocity),
        "staticMarginLiftoff": float(rocket.static_margin(0)),
    }


def pct(a, b):
    return f"{(a - b) / b * 100:+.1f}%" if b else "  n/a"


def main():
    bases = sorted({p.name[: -len(".spec.json")] for p in OUT.glob("*.spec.json")})
    if not bases:
        print("no specs in", OUT, "— run emit.ts first"); sys.exit(1)
    print(f"{'design':<22}{'metric':<16}{'Loft':>10}{'RocketPy':>10}{'OR stored':>11}{'L−RPy':>8}")
    print("-" * 79)
    for base in bases:
        spec = json.load(open(OUT / f"{base}.spec.json"))
        ld = json.load(open(OUT / f"{base}.loft.json"))
        loft, stored = ld["loft"], ld.get("stored")
        real_apogee = ld.get("realApogee")
        try:
            rp = fly(spec)
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
        # Note the real (recovery-flown) apogee when it differs from ballistic — an early ejection.
        if real_apogee is not None and abs(real_apogee - loft["apogee"]) > 0.5:
            print(f"{'':<22}{'  (real w/ chute)':<16}{real_apogee:>10.2f}{'':>10}{'':>11}   early deploy")
        print("-" * 79)


if __name__ == "__main__":
    main()
