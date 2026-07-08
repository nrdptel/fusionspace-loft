/** Top-level `.ork` import: raw file bytes → canonical document. Thin by design — the ZIP
 *  read and the XML→model adaptation are the two steps, each independently tested. */

import { readOrkXml } from "./zip";
import { adaptOrkXml, type OrkDocument } from "./adapt";

export type { OrkDocument, StoredSimulation, StoredResults, StoredConditions } from "./adapt";

/** Import a `.ork` (or `.ork.gz`, or raw OpenRocket XML) from its bytes. */
export async function importOrk(bytes: Uint8Array): Promise<OrkDocument> {
  const xml = await readOrkXml(bytes);
  return adaptOrkXml(xml);
}

/** Convenience for the browser: import directly from a File/Blob. */
export async function importOrkFile(file: Blob): Promise<OrkDocument> {
  const buf = await file.arrayBuffer();
  return importOrk(new Uint8Array(buf));
}
