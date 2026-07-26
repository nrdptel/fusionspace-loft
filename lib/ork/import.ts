/** Top-level design import: raw file bytes → canonical document. Thin by design — read the
 *  design XML out of its container, then adapt it into the one internal model. Three design
 *  formats are understood, sniffed by their XML root: OpenRocket (`.ork`, `<openrocket>`),
 *  RockSim (`.rkt`, `<RockSimDocument>`) and RASAero II (`.CDX1`, `<RASAeroDocument>`). Each
 *  adapter is independently tested; the simulator never sees any of the formats. */

import { readOrkXml } from "./zip";
import { adaptOrkXml, type OrkDocument } from "./adapt";
import { adaptRktXml } from "../rkt/adapt";
import { adaptRasAeroXml } from "../rasaero/adapt";

export type {
  OrkDocument,
  StoredSimulation,
  StoredResults,
  StoredConditions,
  StoredFlightData,
  StoredFlightPoint,
} from "./adapt";

/** Adapt design XML to the canonical document, choosing the importer by the XML root element. */
export function adaptDesignXml(xml: string): OrkDocument {
  // Cheap sniff of the first element name, tolerating a leading declaration/comment/whitespace.
  const head = xml.slice(0, 4096);
  if (/<\s*RockSimDocument[\s>]/.test(head)) return adaptRktXml(xml);
  if (/<\s*RASAeroDocument[\s>]/.test(head)) return adaptRasAeroXml(xml);
  // Fall back to the OpenRocket adapter, which raises a clear "Not an OpenRocket file" error if
  // the root isn't <openrocket> — so an unrecognised format still fails honestly.
  return adaptOrkXml(xml);
}

/** Import a design from its bytes: OpenRocket `.ork`/`.ork.gz`/raw XML, RockSim `.rkt`, or
 *  RASAero `.CDX1`. */
export async function importDesign(bytes: Uint8Array): Promise<OrkDocument> {
  const xml = await readOrkXml(bytes);
  return adaptDesignXml(xml);
}

/** Convenience for the browser: import directly from a File/Blob. */
export async function importDesignFile(file: Blob): Promise<OrkDocument> {
  const buf = await file.arrayBuffer();
  return importDesign(new Uint8Array(buf));
}

/** Back-compat aliases (the importer used to be OpenRocket-only). */
export const importOrk = importDesign;
export const importOrkFile = importDesignFile;

/** The design tool a document came from. `null` when there is none to name — a design built in
 *  Loft rather than imported. */
export type SourceTool = "OpenRocket" | "RockSim" | "RASAero" | null;

/** Which tool produced a document, read from the format stamp each adapter records. This is what
 *  every surface that shows a file's *stored* results must label them with: a RockSim `.rkt` or a
 *  RASAero `.CDX1` carries its own tool's numbers, and calling those "OpenRocket's" attributes a
 *  prediction to a tool that never made it. */
export function sourceTool(doc: Pick<OrkDocument, "formatVersion">): SourceTool {
  const v = doc.formatVersion;
  if (v === "unknown") return null;
  if (v.startsWith("RockSim")) return "RockSim";
  if (v.startsWith("RASAero")) return "RASAero";
  // The OpenRocket adapter stamps the bare file-format version ("1.9"); everything else is
  // prefixed with its tool's name above.
  return "OpenRocket";
}

/** The document's format stamp as a flyer reads it — "RASAero format 2", "OpenRocket format 1.9".
 *  Empty when the design carries no format (built here, not imported). */
export function formatLabel(doc: Pick<OrkDocument, "formatVersion">): string {
  const tool = sourceTool(doc);
  if (!tool) return "";
  const version = doc.formatVersion.startsWith(tool)
    ? doc.formatVersion.slice(tool.length).trim()
    : doc.formatVersion;
  return `${tool} format ${version}`;
}
