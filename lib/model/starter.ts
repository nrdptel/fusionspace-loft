/** A from-scratch starter design for the in-browser builder. Produces the exact internal model an
 *  importer produces — a `Rocket` inside a document with an empty stored-simulation list — so the
 *  builder and the importers converge on one representation and one solver. The starter is a sane,
 *  stable 54 mm sport design on a common 29 mm H motor: a flyer opens it and immediately has a real
 *  flight to tweak, rather than a blank slate that can't be simulated.
 *
 *  Dimensions are chosen for a healthy static margin (~1.5–2 cal) and a sensible mass, so the very
 *  first flight is stable and plausible; every number here is editable through the same geometry
 *  edits the importers' designs use. */

import type {
  Rocket,
  NoseCone,
  BodyTube,
  InnerTube,
  TrapezoidFinSet,
  Parachute,
  MassComponent,
  MotorConfiguration,
  Material,
} from "./types";
import type { OrkDocument } from "../ork/import";

const FIBREGLASS: Material = { name: "fibreglass", density: 1850, type: "bulk" };
const G10: Material = { name: "G10 fibreglass", density: 1850, type: "bulk" };
const RIPSTOP: Material = { name: "ripstop nylon", density: 60, type: "surface" };

/** Build a fresh, flyable starter design (a new internal model, not parsed from any file). */
export function newDesign(): OrkDocument {
  const R = 0.027; // 54 mm airframe outer radius

  const avionics: MassComponent = {
    id: "av",
    name: "Altimeter + battery",
    kind: "masscomponent",
    placement: { method: "top", offset: 0.05 },
    mass: 0.09,
    length: 0.08,
    radius: 0.02,
    massType: "flightcomputer",
    children: [],
  };
  const chute: Parachute = {
    id: "chute",
    name: "Main parachute",
    kind: "parachute",
    placement: { method: "top", offset: 0.14 },
    cd: 0.8,
    diameter: 0.9,
    mass: 0.06,
    deployEvent: "apogee",
    deployDelay: 0,
    material: RIPSTOP,
    children: [],
  };
  const mount: InnerTube = {
    id: "mount",
    name: "Motor mount",
    kind: "innertube",
    placement: { method: "bottom", offset: 0 },
    length: 0.2,
    outerRadius: 0.0155,
    innerRadius: 0.0145,
    motorMount: { overhang: 0.005 },
    material: FIBREGLASS,
    children: [],
  };
  const fins: TrapezoidFinSet = {
    id: "fins",
    name: "Fins",
    kind: "trapezoidfinset",
    placement: { method: "bottom", offset: 0 },
    finCount: 3,
    rootChord: 0.14,
    tipChord: 0.06,
    height: 0.06,
    sweepLength: 0.06,
    thickness: 0.003,
    crossSection: "rounded",
    material: G10,
    finish: "smooth-paint",
    children: [],
  };
  const body: BodyTube = {
    id: "body",
    name: "Body tube",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    length: 0.62,
    outerRadius: R,
    thickness: 0.0015,
    material: FIBREGLASS,
    finish: "smooth-paint",
    children: [avionics, chute, mount, fins],
  };
  const nose: NoseCone = {
    id: "nose",
    name: "Nose cone",
    kind: "nosecone",
    placement: { method: "after", offset: 0 },
    length: 0.22,
    aftRadius: R,
    thickness: 0.002,
    shape: "ogive",
    material: FIBREGLASS,
    finish: "smooth-paint",
    children: [],
  };

  const config: MotorConfiguration = {
    id: "cfg-1",
    name: "H128W",
    instances: [
      {
        mountId: "mount",
        motor: {
          manufacturer: "AeroTech",
          designation: "H128W",
          type: "single-use",
          diameter: 0.029,
          length: 0.194,
          delay: 14,
        },
      },
    ],
  };

  const rocket: Rocket = {
    name: "New design",
    stages: [{ name: "Sustainer", components: [nose, body] }],
    configurations: [config],
    defaultConfigId: "cfg-1",
    referenceType: "maximum",
  };

  return { rocket, simulations: [], formatVersion: "unknown", warnings: [], flownAsReduced: false };
}
