/** The canonical internal rocket model.
 *
 *  This is the single source of truth the simulation reads. It is shaped like
 *  OpenRocket's component tree — a rocket has ordered stages, each stage a tree of
 *  components, each component placed relative to its parent — so a design editor can be
 *  layered on top later without reshaping the model. But every field the physics needs is
 *  first-class here, and everything is SI (metres, kilograms, seconds, radians, kelvin).
 *
 *  Importers (the `.ork` adapter today; a RocketPy adapter later) are thin: they translate
 *  a foreign description INTO this model. The solver never sees a `.ork` — it only sees a
 *  `Rocket`. That boundary is what makes new import formats "just another adapter."
 */

// --- placement ------------------------------------------------------------------------

/** How a component is positioned axially relative to its parent. Mirrors OpenRocket's
 *  `<position type=...>` so a round-trip to an editor is lossless. Offsets are metres. */
export type AxialMethod = "top" | "middle" | "bottom" | "after" | "absolute";

export interface Placement {
  method: AxialMethod;
  /** Axial offset in metres, interpreted per `method`. */
  offset: number;
  /** Radial offset from the centreline (m) — used for pods/masses; 0 for on-axis parts. */
  radialOffset?: number;
}

// --- materials ------------------------------------------------------------------------

export type MaterialType = "bulk" | "surface" | "line";

export interface Material {
  name: string;
  /** Density: kg/m³ (bulk), kg/m² (surface), or kg/m (line). */
  density: number;
  type: MaterialType;
}

/** Surface finish → equivalent roughness height (m), for skin-friction drag. Values are
 *  the standard OpenRocket / Barrowman finish categories. */
export type SurfaceFinish =
  | "rough"
  | "unfinished"
  | "regular-paint"
  | "smooth-paint"
  | "polished"
  | "mirror";

// --- component kinds ------------------------------------------------------------------

export type ComponentKind =
  | "nosecone"
  | "bodytube"
  | "transition"
  | "trapezoidfinset"
  | "ellipticalfinset"
  | "freeformfinset"
  | "innertube"
  | "tubecoupler"
  | "centeringring"
  | "bulkhead"
  | "engineblock"
  | "masscomponent"
  | "parachute"
  | "streamer"
  | "shockcord"
  | "launchlug"
  | "railbutton";

/** Nose/transition contour shapes (Barrowman needs the shape for volume & CP). */
export type NoseShape =
  | "ogive"
  | "conical"
  | "ellipsoid"
  | "power"
  | "parabolic"
  | "haack";

interface ComponentBase {
  id: string;
  name: string;
  kind: ComponentKind;
  placement: Placement;
  material?: Material;
  finish?: SurfaceFinish;
  /** If set, this mass (kg) replaces the component's computed mass. */
  overrideMass?: number;
  /** If set, this axial CG (m, from the component's own fore end) replaces the computed one. */
  overrideCGx?: number;
  /** When true, the overrides above also subsume this component's children. */
  overrideSubcomponents?: boolean;
  children: RocketComponent[];
}

export interface NoseCone extends ComponentBase {
  kind: "nosecone";
  length: number;
  /** Base (aft) outer radius (m). */
  aftRadius: number;
  /** Wall thickness (m); 0 or undefined ⇒ solid. */
  thickness?: number;
  shape: NoseShape;
  /** Shape parameter for power/parabolic/haack contours. */
  shapeParameter?: number;
  aftShoulderLength?: number;
  aftShoulderRadius?: number;
  /** Aft shoulder wall thickness (m); 0/undefined ⇒ the nose's own wall thickness, else solid. */
  aftShoulderThickness?: number;
  /** Aft shoulder is closed by an end cap (a bulkhead disc), adding its material. */
  aftShoulderCapped?: boolean;
}

export interface BodyTube extends ComponentBase {
  kind: "bodytube";
  length: number;
  outerRadius: number;
  thickness?: number;
  /** Motor-mount role — a body tube can hold the motor directly (minimum-diameter). */
  motorMount?: MotorMount;
}

export interface Transition extends ComponentBase {
  kind: "transition";
  length: number;
  foreRadius: number;
  aftRadius: number;
  thickness?: number;
  shape: NoseShape;
  shapeParameter?: number;
  foreShoulderLength?: number;
  foreShoulderRadius?: number;
  foreShoulderThickness?: number;
  foreShoulderCapped?: boolean;
  aftShoulderLength?: number;
  aftShoulderRadius?: number;
  aftShoulderThickness?: number;
  aftShoulderCapped?: boolean;
}

/** Fin edge cross-section, which sets the leading-edge pressure drag. A square edge stagnates
 *  the flow head-on; a rounded edge roughly halves that; an airfoil is streamlined (almost no
 *  subsonic pressure drag). Matches the OpenRocket categories. Absent ⇒ treated as square, the
 *  OpenRocket default. */
export type FinCrossSection = "square" | "rounded" | "airfoil";

export interface TrapezoidFinSet extends ComponentBase {
  kind: "trapezoidfinset";
  finCount: number;
  rootChord: number;
  tipChord: number;
  /** Semi-span, root-to-tip height (m). */
  height: number;
  /** Distance the leading edge of the tip is swept aft of the root leading edge (m). */
  sweepLength: number;
  thickness: number;
  crossSection?: FinCrossSection;
  cantAngle?: number;
}

/** Elliptical/freeform fin sets are reduced to their aerodynamically-equivalent trapezoid
 *  (equal area, span, and mean sweep) at import; only the fields the solver needs survive. */
export interface GenericFinSet extends ComponentBase {
  kind: "ellipticalfinset" | "freeformfinset";
  finCount: number;
  rootChord: number;
  /** Planform area of one fin (m²). */
  area: number;
  height: number;
  /** Spanwise distance from root LE to the area centroid's chord LE (m). */
  sweepLength: number;
  thickness: number;
  crossSection?: FinCrossSection;
  /** Exact chordwise centre of pressure from the root leading edge (m), computed from a freeform
   *  planform's actual outline at import (Barrowman strip-theory quarter-chord centroid). When set,
   *  the aero uses it instead of reducing the planform to an equal-area trapezoid. Span-scale
   *  invariant, so it stays valid when the fin is stretched by a geometry edit. */
  cpChord?: number;
}

export interface InnerTube extends ComponentBase {
  kind: "innertube";
  length: number;
  outerRadius: number;
  innerRadius: number;
  motorMount?: MotorMount;
}

/** Rings and disks: tube couplers, centering rings, bulkheads, engine blocks. Modelled as
 *  annular (or solid) cylinders for mass; no aerodynamic contribution. */
export interface RingComponent extends ComponentBase {
  kind: "tubecoupler" | "centeringring" | "bulkhead" | "engineblock";
  length: number;
  outerRadius: number;
  innerRadius: number;
}

export interface MassComponent extends ComponentBase {
  kind: "masscomponent";
  /** Explicit mass (kg) — this component's mass is always its stated value. */
  mass: number;
  length?: number;
  radius?: number;
  /** "altimeter" | "flightcomputer" | "ballast" | "battery" | "recoveryhardware" | "payload" */
  massType?: string;
}

export type DeployEvent =
  | "launch"
  | "ejection"
  | "apogee"
  | "altitude"
  | "never"
  | "lowerstage-separation";

/** A recovery-deployment setting: the trigger event, the altitude for an altitude trigger, and
 *  the delay after the trigger before the canopy opens. OpenRocket lets these differ per motor
 *  configuration — the same design can drogue-at-apogee on one motor and deploy at a set
 *  altitude on another — so devices carry per-config overrides keyed by configuration id. */
export interface DeploySetting {
  event: DeployEvent;
  altitude?: number;
  delay: number;
}

export interface Parachute extends ComponentBase {
  kind: "parachute";
  /** Drag coefficient of the canopy. */
  cd: number;
  /** Canopy diameter (m). Area is derived as a flat circle unless `area` is given. */
  diameter: number;
  /** Explicit reference area (m²), if the format supplied it instead of a diameter. */
  area?: number;
  mass: number;
  deployEvent: DeployEvent;
  /** Deployment altitude AGL (m), when `deployEvent === "altitude"`. */
  deployAltitude?: number;
  /** Delay after the trigger event (s). */
  deployDelay?: number;
  /** Per-motor-configuration deployment overrides, keyed by config id; the flown config's
   *  override wins over the default event above. */
  deployConfigs?: Record<string, DeploySetting>;
  packedLength?: number;
  packedRadius?: number;
}

export interface Streamer extends ComponentBase {
  kind: "streamer";
  cd: number;
  stripLength: number;
  stripWidth: number;
  mass: number;
  deployEvent: DeployEvent;
  deployAltitude?: number;
  deployDelay?: number;
  deployConfigs?: Record<string, DeploySetting>;
  packedLength?: number;
}

/** Small mass-only parts kept for mass/CG accuracy; negligible aero (a launch lug's tiny
 *  drag is folded into the interference/roughness allowance rather than modelled). */
export interface MinorComponent extends ComponentBase {
  kind: "shockcord" | "launchlug" | "railbutton";
  mass?: number;
  length?: number;
  /** Outer radius (m) of a launch lug or rail button — its frontal size, for protuberance drag. */
  radius?: number;
  /** How many of this fitting are on the airframe (a pair of rail buttons, twin lugs). */
  instanceCount?: number;
}

export type RocketComponent =
  | NoseCone
  | BodyTube
  | Transition
  | TrapezoidFinSet
  | GenericFinSet
  | InnerTube
  | RingComponent
  | MassComponent
  | Parachute
  | Streamer
  | MinorComponent;

// --- motors ---------------------------------------------------------------------------

/** A component's role as a motor mount. The actual motors loaded into it live in the
 *  rocket's motor configurations (keyed by config id), matching OpenRocket. */
export interface MotorMount {
  /** How far the motor sticks out past the aft end of the mount (m). */
  overhang: number;
  /** Motors held, from OpenRocket's cluster configuration (e.g. "4-ring" ⇒ 4). 1, or absent,
   *  is a single motor. A cluster is flown as this many identical coaxial motors. */
  clusterCount?: number;
}

export type MotorType = "single-use" | "reload" | "hybrid" | "unknown";

/** The motor as *referenced* by a design — manufacturer + designation + envelope. A `.ork`
 *  does NOT embed the thrust curve, so this is resolved against the bundled motor database
 *  to get thrust-vs-time and the propellant-mass profile before simulating. */
export interface MotorSpec {
  manufacturer?: string;
  designation: string;
  type: MotorType;
  /** Casing diameter (m). */
  diameter: number;
  /** Casing length (m). */
  length: number;
  digest?: string;
  /** Ejection-charge delay (s), if the design pinned one. */
  delay?: number;
}

export interface MotorInstance {
  /** Id of the mount component the motor sits in. */
  mountId: string;
  motor: MotorSpec;
  ignitionEvent?: string;
  ignitionDelay?: number;
}

export interface MotorConfiguration {
  id: string;
  name?: string;
  instances: MotorInstance[];
}

// --- rocket ---------------------------------------------------------------------------

/** When a (booster) stage separates from the stack above it, following OpenRocket's convention.
 *  `ejection` is the stage's own motor ejection charge (the common payload/dual-section case, often
 *  a long delay so separation falls near apogee); `upperignition`/`burnout`/unspecified all reduce
 *  to the stage finishing its burn (Loft's serial-staging default). */
export type SeparationEvent =
  | "burnout"
  | "ejection"
  | "apogee"
  | "launch"
  | "upperignition"
  | "altitude"
  | "never";

/** A stage-separation setting: the trigger event and a delay after it. Like a recovery device,
 *  OpenRocket lets a stage separate on a *different* event per motor configuration — e.g. drop the
 *  booster at its ejection charge on one motor but at upper-stage ignition on another — so a stage
 *  can carry per-config overrides keyed by configuration id (see `Stage.separationConfigs`). */
export interface SeparationSetting {
  event?: SeparationEvent;
  delay?: number;
}

export interface Stage {
  name: string;
  components: RocketComponent[];
  /** How this stage separates from the stack above it. Undefined ⇒ the serial-staging default
   *  (separate when the stage finishes burning). */
  separationEvent?: SeparationEvent;
  /** Delay (s) added after the separation event fires. Usually 0. */
  separationDelay?: number;
  /** Per-motor-configuration separation overrides, keyed by config id; the flown config's override
   *  wins over the default event above. A two-stage design commonly separates at upper-stage
   *  ignition on one motor and at the booster's ejection charge on another. */
  separationConfigs?: Record<string, SeparationSetting>;
  /** A stage is a component assembly in OpenRocket, so it too can carry a mass/CG override. When
   *  set together with `overrideSubcomponents`, this measured figure replaces the combined mass of
   *  every component in the stage (the design's own weight for the whole section). */
  overrideMass?: number;
  /** CG override (m from the stage's fore station), applied when the stage overrides its mass. */
  overrideCGx?: number;
  /** True when the stage's `overrideMass` stands in for the whole assembly (self + all parts). */
  overrideSubcomponents?: boolean;
}

/** How the aerodynamic reference area/diameter is chosen (OpenRocket's convention). */
export type ReferenceType = "maximum" | "nose" | "custom";

export interface Rocket {
  name: string;
  designer?: string;
  /** Ordered nose→tail. The wedge simulates a single active stage. */
  stages: Stage[];
  configurations: MotorConfiguration[];
  defaultConfigId?: string;
  referenceType: ReferenceType;
  /** Explicit reference radius (m) when `referenceType === "custom"`. */
  referenceRadius?: number;
}
