/** Fetch the real-design corpus that `lib/corpus/sweep.test.ts` runs against.
 *
 *  The corpus is other people's design files, under their own terms, so it is never committed to
 *  this repository. It lives in a separate PRIVATE repo, pinned by `fixtures.lock.json`, and is
 *  extracted into a gitignored `corpus/` here.
 *
 *  With no token this exits 0 and does nothing, so a public clone and a fork's CI stay green — the
 *  corpus suite then skips itself. CI holds `FIXTURES_TOKEN` as a secret and runs this before the
 *  tests, so the corpus genuinely gates every push.
 *
 *      FIXTURES_TOKEN=<pat> node scripts/fetch-fixtures.mjs
 *      LOFT_FIXTURES_TARBALL=/path/to.tar.gz node scripts/fetch-fixtures.mjs   # offline / local
 *
 *  What it verifies, in order: the snapshot's own CHECKSUMS.sha256 against the digest in the lock
 *  file, then every design file against that manifest. Pinning a commit rather than a tag keeps the
 *  pin immutable, and verifying the manifest rather than the archive keeps it honest even though
 *  GitHub's generated tarballs are not byte-reproducible.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = JSON.parse(readFileSync(join(ROOT, "fixtures.lock.json"), "utf8"));
const CORPUS = process.env.LOFT_CORPUS_DIR ?? join(ROOT, "corpus");
const TOKEN = process.env.FIXTURES_TOKEN || process.env.GITHUB_TOKEN || "";
const LOCAL = process.env.LOFT_FIXTURES_TARBALL || "";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const say = (msg) => console.log(`fetch-fixtures: ${msg}`);

/** No credentials is the normal case for a public clone — say so once and succeed. */
if (!TOKEN && !LOCAL) {
  say("no FIXTURES_TOKEN — skipping the corpus fetch (the corpus suite will skip itself)");
  process.exit(0);
}

/** The tarball endpoint answers with a redirect to a pre-signed codeload URL. Follow it by hand and
 *  drop the Authorization header when the host changes: the signed URL carries its own credential,
 *  and forwarding a bearer token to a different host is both unnecessary and worth not doing. Some
 *  fetch implementations strip it on a cross-origin redirect anyway — doing it explicitly means the
 *  behaviour is ours rather than the runtime's. */
async function download() {
  if (LOCAL) return readFileSync(LOCAL);
  let url = `https://api.github.com/repos/${LOCK.repo}/tarball/${LOCK.commit}`;
  say(`downloading ${LOCK.repo}@${LOCK.commit.slice(0, 12)}`);
  let host = new URL(url).host;
  for (let hop = 0; hop <= 5; hop++) {
    const sameHost = new URL(url).host === host;
    const res = await fetch(url, {
      headers: {
        ...(sameHost ? { Authorization: `Bearer ${TOKEN}` } : {}),
        Accept: "application/vnd.github+json",
        "User-Agent": "loft-fetch-fixtures",
      },
      redirect: "manual",
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      host = new URL(url).host === host ? host : "";
      continue;
    }
    if (!res.ok) {
      // 404 on a private repo means "no access" as often as "no such commit"; say both.
      throw new Error(
        `${res.status} ${res.statusText} fetching the corpus. ` +
          (res.status === 404
            ? "The token may lack access to the private fixtures repo, or the pinned commit may not exist."
            : "Check FIXTURES_TOKEN."),
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("too many redirects fetching the corpus");
}

/** Every file under `dir`, as repo-relative POSIX paths. */
function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(p.slice(base.length + 1).split("\\").join("/"));
  }
  return out;
}

const work = mkdtempSync(join(tmpdir(), "loft-fixtures-"));
try {
  const tarball = await download();
  const archive = join(work, "corpus.tar.gz");
  writeFileSync(archive, tarball);

  // GitHub wraps the tree in a single `<owner>-<repo>-<sha>/` directory; strip it.
  const extracted = join(work, "x");
  mkdirSync(extracted);
  execFileSync("tar", ["-xzf", archive, "-C", extracted, "--strip-components=1"], { stdio: "pipe" });

  const manifestPath = join(extracted, "CHECKSUMS.sha256");
  if (!existsSync(manifestPath)) throw new Error("the snapshot carries no CHECKSUMS.sha256 to verify against");
  const manifestRaw = readFileSync(manifestPath);
  const manifestDigest = sha256(manifestRaw);
  if (manifestDigest !== LOCK.checksums) {
    throw new Error(
      `CHECKSUMS.sha256 does not match fixtures.lock.json\n  expected ${LOCK.checksums}\n  got      ${manifestDigest}\n` +
        "The pinned snapshot changed. Re-cut the lock file deliberately rather than loosening this.",
    );
  }

  // Verify every design file the manifest names, and refuse a snapshot that carries extra ones —
  // an unlisted file in the corpus is a file nobody hashed.
  const expected = new Map();
  for (const line of manifestRaw.toString("utf8").split("\n")) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/);
    if (m) expected.set(m[2], m[1]);
  }
  let verified = 0;
  for (const [rel, want] of expected) {
    const p = join(extracted, rel);
    if (!existsSync(p)) throw new Error(`the snapshot is missing a file its own manifest names: ${rel}`);
    const got = sha256(readFileSync(p));
    if (got !== want) throw new Error(`checksum mismatch on ${rel}\n  expected ${want}\n  got      ${got}`);
    verified++;
  }
  if (verified !== LOCK.files) {
    throw new Error(`the lock file expects ${LOCK.files} design files; the snapshot verified ${verified}`);
  }

  // Only the per-tool directories the suite reads — the provenance docs stay in the fixtures repo.
  const staged = join(work, "corpus");
  mkdirSync(staged);
  const unlisted = [];
  for (const tool of LOCK.tools) {
    const from = join(extracted, tool);
    if (!existsSync(from)) continue;
    for (const rel of walk(from)) {
      if (!expected.has(`${tool}/${rel}`)) unlisted.push(`${tool}/${rel}`);
    }
    renameSync(from, join(staged, tool));
  }
  // A file in the corpus tree that the manifest doesn't name is a file nobody hashed. Not fatal —
  // the fixtures repo carries placeholder notes alongside the designs — but never silent.
  if (unlisted.length) {
    say(`${unlisted.length} file(s) present but not in the manifest: ${unlisted.join(", ")}`);
  }
  rmSync(CORPUS, { recursive: true, force: true });
  mkdirSync(dirname(CORPUS), { recursive: true });
  renameSync(staged, CORPUS);
  say(`verified ${verified} design files against the pinned manifest → ${CORPUS}`);
} catch (err) {
  console.error(`fetch-fixtures: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
