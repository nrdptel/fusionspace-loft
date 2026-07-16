/** Extract the `rocket.ork` XML from a `.ork` file with no third-party dependency.
 *
 *  A `.ork` is a ZIP archive (DEFLATE) whose first `*.ork`/`*.rkt`/`*.cdx1` entry is the
 *  design XML. OpenRocket also reads gzip-wrapped and bare XML, so we sniff the leading
 *  bytes (0x1F8B gzip, "PK" zip, else raw) rather than trust the extension. Decompression
 *  uses the platform `DecompressionStream` (deflate-raw / gzip), which exists in modern
 *  browsers and in Node ≥ 18 — so the same code path runs in the app and in tests. */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;

async function inflate(bytes: Uint8Array, format: "deflate-raw" | "gzip"): Promise<Uint8Array> {
  // `DecompressionStream` is a web-streams global (browser + Node ≥ 18).
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("zip: DecompressionStream unavailable in this environment");
  try {
    const ds = new DS(format);
    const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    // A truncated or corrupt compressed stream rejects with an unhelpful (often empty-message)
    // native error; replace it with a clear, actionable one.
    throw new Error("Could not decompress the file — it may be corrupt or not a valid design file.");
  }
}

/** Find the End-Of-Central-Directory record (scans back from the end). */
function findEocd(view: DataView, len: number): number {
  const min = Math.max(0, len - 65557); // max comment length + EOCD size
  for (let p = len - 22; p >= min; p--) {
    if (view.getUint32(p, true) === SIG_EOCD) return p;
  }
  return -1;
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes.length);
  if (eocd === -1) throw new Error("zip: end-of-central-directory not found");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries: CentralEntry[] = [];
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extractEntry(bytes: Uint8Array, entry: CentralEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  // Local header: name length at +26, extra at +28; data begins after both.
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return data.slice(); // stored
  if (entry.method === 8) return inflate(data, "deflate-raw"); // deflate
  throw new Error(`zip: unsupported compression method ${entry.method}`);
}

/** Read the design XML text from `.ork` bytes (ZIP, gzip, or raw XML). */
export async function readOrkXml(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder("utf-8");

  // gzip?
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return decoder.decode(await inflate(bytes, "gzip"));
  }

  // zip?
  if (bytes.length > 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = readCentralDirectory(bytes);
    const wanted = entries.find((e) => /\.(ork|rkt|cdx1)$/i.test(e.name)) ?? entries[0];
    if (!wanted) throw new Error("zip: no design entry found in archive");
    return decoder.decode(await extractEntry(bytes, wanted));
  }

  // raw XML.
  return decoder.decode(bytes);
}
