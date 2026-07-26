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

/** What a file's leading bytes say it is, for telling a flyer what went wrong in terms of the file
 *  they actually picked rather than the container we failed to open. */
function sniff(bytes: Uint8Array): "zip" | "gzip" | "pdf" | "image" | "text" | "binary" {
  const b = bytes;
  if (b.length < 4) return "binary";
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip"; // "PK"
  if (b[0] === 0x1f && b[1] === 0x8b) return "gzip";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // "%PDF"
  if (b[0] === 0x89 && b[1] === 0x50) return "image"; // PNG
  if (b[0] === 0xff && b[1] === 0xd8) return "image"; // JPEG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image"; // GIF
  // Printable-ish in the first kilobyte ⇒ treat it as text (XML, CSV, HTML, a source file).
  const head = b.subarray(0, Math.min(1024, b.length));
  let printable = 0;
  for (const c of head) if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128) printable++;
  return printable / head.length > 0.9 ? "text" : "binary";
}

const FORMATS = "OpenRocket .ork, RockSim .rkt, or RASAero .CDX1";

/** Turn whatever the container or the parser threw into something a flyer can act on. The low-level
 *  readers speak their own language — "end-of-central-directory not found", "no root element" — which
 *  is the right language for a bug report and the wrong one for the front door of the app. The
 *  original is kept as the error's `cause`, so nothing is lost. */
function importFailure(bytes: Uint8Array, err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  const kind = sniff(bytes);
  // A message the adapters wrote for a human already — "Not a RockSim file (root <x>)" and friends —
  // is the most specific thing we know; lead with it and add the way forward.
  const named = /^(Not a|OpenRocket file|RockSim file|RASAero file)/.test(detail);
  const say = (msg: string) => Object.assign(new Error(msg), { cause: err });

  if (bytes.length === 0) return say("That file is empty. Pick the design file your tool saved.");
  if (kind === "pdf" || kind === "image") {
    return say(
      `That looks like ${kind === "pdf" ? "a PDF" : "an image"}, not a rocket design. Loft reads ${FORMATS} — the file the design tool saves, not an export of the drawing.`,
    );
  }
  if (kind === "zip" && /no design entry/i.test(detail)) {
    return say(
      "That is a zip archive with no design inside it. An .ork is itself a zip holding the design XML — if this one was re-zipped or renamed, use the file the design tool saved.",
    );
  }
  if (kind === "zip" || kind === "gzip" || /decompress|corrupt|central-directory/i.test(detail)) {
    return say("That file could not be unpacked — it looks truncated or corrupt. Try saving it again from the tool that made it.");
  }
  if (named) {
    return say(`${detail}. Loft reads ${FORMATS}; if this came from another tool, export it as one of those.`);
  }
  if (kind === "text") {
    return say(`That does not look like a rocket design file. Loft reads ${FORMATS} — a flight log or a spreadsheet goes in the flight-log box on the results instead.`);
  }
  return say(`That file could not be read as a rocket design. Loft reads ${FORMATS}.`);
}

/** Import a design from its bytes: OpenRocket `.ork`/`.ork.gz`/raw XML, RockSim `.rkt`, or
 *  RASAero `.CDX1`. */
export async function importDesign(bytes: Uint8Array): Promise<OrkDocument> {
  let xml: string;
  try {
    xml = await readOrkXml(bytes);
  } catch (err) {
    throw importFailure(bytes, err);
  }
  try {
    return adaptDesignXml(xml);
  } catch (err) {
    throw importFailure(bytes, err);
  }
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
