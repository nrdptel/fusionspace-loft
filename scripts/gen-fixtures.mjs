// Regenerate the committed design fixtures from their readable source.
//
// `fixtures/src/*.ork.xml` is the human-editable truth; the loadable `.ork` is that XML zipped
// with a single `rocket.ork` entry, exactly like a file OpenRocket writes. The app ALSO serves
// three of those designs from `public/samples/` for its one-tap examples — and because both
// copies were maintained by hand, they drifted: a change marking the fixtures' stored results
// `status="external"` reached the test fixtures but not the samples users actually click, so the
// app kept attributing author-estimated figures to OpenRocket on exactly the files it ships.
//
// Both copies are now generated from the one source, so they cannot disagree again. It is a DEV
// tool — not part of the build (which must stay hermetic) — run after editing a fixture:
//   node scripts/gen-fixtures.mjs
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(root, "fixtures", "src");
const fixturesDir = resolve(root, "fixtures");
const samplesDir = resolve(root, "public", "samples");

/** The designs the app offers as one-tap examples; the rest are test fixtures only.
 *
 *  **The last two were added 2026-08-08 and closed two capability gaps for the cost of this literal.**
 *  Measured against what the adapter and the model support, the bundled set covered NEITHER a
 *  transition/boattail nor a non-trapezoidal fin planform — while `demo-boattail.ork` had both, was
 *  already generated from source, already loaded, and already carried a RocketPy cross-check
 *  reference; and `demo-payload-separation.ork` had the separation event no sample showed. They were
 *  test fixtures and nothing else, so a flyer who arrived without a design file of their own could
 *  not see either capability exists.
 *
 *  Adding a name here is the whole job for a design that already has a source: it lands in
 *  `public/samples/` on the next run of this script, and `lib/version.test.ts` then requires the
 *  import screen to offer it and the README's count to match. */
const SAMPLES = new Set([
  "demo-single-deploy.ork",
  "demo-dual-deploy.ork",
  "demo-multi-config.ork",
  "demo-boattail.ork",
  "demo-payload-separation.ork",
  // The one inside the stable band — see the comment at the top of its source. Every other sample
  // greets a stranger with an over-stable caution.
  "demo-stable.ork",
]);

/** A minimal, deterministic ZIP holding one deflated entry. Deterministic matters: a fixed
 *  timestamp keeps the committed binaries byte-stable, so regenerating an unchanged source
 *  produces no diff and a real change produces a reviewable one. */
function zipOneEntry(name, contents) {
  const nameBytes = Buffer.from(name, "utf-8");
  const data = Buffer.from(contents, "utf-8");
  const deflated = deflateRawSync(data, { level: 9 });
  const crc = crc32(data) >>> 0;
  // MS-DOS date/time for 1980-01-01 00:00:00, the epoch of the ZIP format itself.
  const dosTime = 0;
  const dosDate = 0x0021;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28); // extra length

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(0, 42); // local header offset

  const centralStart = local.length + nameBytes.length + deflated.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, nameBytes, deflated, central, nameBytes, end]);
}

let wrote = 0;
for (const file of (await readdir(srcDir)).sort()) {
  if (!file.endsWith(".ork.xml")) continue;
  const xml = await readFile(resolve(srcDir, file), "utf-8");
  const name = basename(file, ".xml"); // demo-foo.ork
  const zip = zipOneEntry("rocket.ork", xml);
  await writeFile(resolve(fixturesDir, name), zip);
  wrote++;
  if (SAMPLES.has(name)) {
    await writeFile(resolve(samplesDir, name), zip);
    wrote++;
  }
}
// The RockSim source IS the loadable file, so the sample is a straight copy.
const rkt = await readFile(resolve(srcDir, "demo-rocksim.rkt"));
await writeFile(resolve(samplesDir, "demo-rocksim.rkt"), rkt);
wrote++;

console.log(`gen-fixtures: wrote ${wrote} files from ${srcDir}`);
