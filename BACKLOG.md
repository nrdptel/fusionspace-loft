# Backlog

Rough edges, missing affordances, and ideas too big for one pass — noticed while working,
not yet done. Newest first. One line each. Anything here is fair game for the next session.

- RASAero `.CDX1` import is blocked on one design call, not on parsing: the format is a small,
  ordered XML part list (inches/pounds) that also stores RASAero's own predicted apogee, but it
  carries NO materials or per-part masses — only `SustainerLaunchWt` and `SustainerCG`. Flying it
  needs the internal model to express "the whole vehicle weighs X loaded with its CG at Y", with
  the resolved motor's mass subtracted from the structure, rather than per-component overrides.
- Two RockSim corpus fixtures store results that don't match their own geometry (`TubeFins1.rkt`
  weighs its tube fins as solid rods; `rocksimTestRocket1.rkt` reads 52% low on max acceleration,
  a pre-deployment number) — both are OpenRocket's synthetic import-test files, so they want a
  `knownIssue` marking them unusable as accuracy oracles once the corpus suite exists.
- ThrustCurve has no RASP file for Cesaroni H225-14A (RockSim `.rse` only); an `.rse` curve reader
  would unlock it and a long tail of other motors that only ship in that format.
- RASAero `.CDX1` files don't import (4 in the corpus): the adapter would be thin — `.CDX1`
  is plain XML — and it unlocks a whole tool family plus one cross-tool same-design group.
- RocketPy `.py` / `.ipynb` design scripts don't import; the corpus carries three, two of
  them with *actual flown* apogees (NDRT 2020, Valetudo) — the strongest ground truth there is.
- Tube fins can't be edited: no diagram handles, no what-if fields, and `lib/model/edit.ts`
  still finds only trapezoid/elliptical/freeform sets as "the" fin set.
- Tube-fin aero omits tube-to-body and tube-to-tube interference drag, any ring-wing lift
  beyond the captured streamtube, and the shielding of the airframe inside the tubes; the
  CP reads ~0.9 caliber forward of OpenRocket's on its own example.
- Ring tails (`<RingTail>` in RockSim) are still dropped with a warning.
- The private fixture corpus (`nrdptel/loft-fixtures`, 38 real files) is not wired into the
  repo at all — no lock file, no `fetch-fixtures` step, no gated corpus suite. It is the
  sharpest bug-finder available and today it only runs by hand.
- `02.Two-stage.ork` flies 81% low and `Parallel booster staging.ork` sim 2 flies 35% high —
  both worth a look once the corpus suite exists to hold them.
- `Pods--airframes and winglets.ork` sim 1 reads +25%: pods are dropped, so the comparison is
  withheld, but the pods' own drag is simply missing.
- Deployment velocity is the worst metric in almost every corpus comparison (e.g. +153% on
  OpenRocket's tube-fin example) — the chute-deploy timing model looks like the cause.
- A `.ork` whose motor Loft can't resolve flies with no propulsion; the same-casing substitute
  is offered, but a design with *several* unresolvable motors makes you pick one by one.
