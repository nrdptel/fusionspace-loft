"""Fly a Loft-emitted RocketPy spec in RocketPy, and return its ascent metrics.

This is the single shared flight routine for both RocketPy runners:
  * the native dev cross-check (run_rocketpy.py), and
  * the in-browser second solver (Pyodide/WASM), which loads this exact file into the WASM
    filesystem and calls fly(spec) — so what the browser flies is identical to what the dev
    harness flies.

The spec is assembled by lib/validation/rocketpy-spec.ts (buildRocketpySpec). It carries Loft's
own Cd(Mach) curve — RocketPy does not derive drag from geometry — so a RocketPy run cross-checks
the trajectory integrator, the mass model, and RocketPy's independent Barrowman centre of pressure
while holding the drag model equal. Scope: single-stage, ascent to apogee (terminate_on_apogee).

Keep this import-light and side-effect-free: it must import cleanly under Pyodide, where netCDF4 is
stubbed out (see scripts/rocketpy/pyodide/).
"""

from rocketpy import Environment, GenericMotor, Rocket, Flight


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
