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
