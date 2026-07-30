/** Component identity, and the one rule about its SHAPE.
 *
 *  An id is opaque to everything that reads it: nothing in the solver, the UI or the edit model parses
 *  one for order, kind or anything else. There is exactly one exception, and it is what decides the
 *  shape — `lib/ork/export.ts` writes a component's id into the `.ork` `<id>` element, and that element
 *  is not a free-form label.
 *
 *  Measured over the 27 real OpenRocket designs in the corpus: **423 `<id>` elements, 0 that are not an
 *  RFC-4122 UUID, and 0 that are not version 4.** No counter-example anywhere, across files written by
 *  OpenRocket 23.09, 24.12, 24.12.beta.01 and a 26.xx snapshot. So UUID-shaped is the format's de facto
 *  type for this element, and writing anything else would be the first such value any of those tools has
 *  seen. That is the whole argument, and it is enough.
 *
 *  A stronger claim was tempting and is false, so it is written down rather than left to be re-derived:
 *  ids are NOT cross-referenced between components. Counting how often each id VALUE appears in
 *  `3D printable nose cone and fins.ork` finds one repeating 11 times, which looks like a reference
 *  graph — but all 17 of that file's `<id>` elements are distinct, and the repeated value is the
 *  ROCKET's own id, cited by `<event source=…>` records inside stored flight data that Loft neither
 *  reads nor writes. Uniqueness is only required within a file, which OpenRocket itself demonstrates:
 *  `13fcc99a-97af-4285-a18b-3748b018fbdf` is used in both `A simple model rocket.ork` and
 *  `Deployable payload.ork`.
 *
 *  Hence: Loft's own ids are UUID-shaped, and an id that is not one gets a UUID DERIVED from it rather
 *  than a fresh one. Derived, not random, because the whole point is that the same design serialises to
 *  the same ids every time. That is what lets a stored selection survive a reload: a design built here
 *  is persisted as its own exported bytes, so before this the ids came back different every time and a
 *  saved selection matched nothing.
 */

/** Is this already a well-formed RFC-4122 UUID, and therefore safe to write into `<id>` as-is? */
export function isUuidShaped(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const FNV_PRIME = 0x01000193;

/** FNV-1a over the string's UTF-16 code units, byte by byte so a non-Latin name mixes as well as an
 *  ASCII one. `basis` salts the pass, which is how four passes give four independent words. */
function fnv1a(s: string, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    h = Math.imul(h ^ (u & 0xff), FNV_PRIME) >>> 0;
    h = Math.imul(h ^ ((u >>> 8) & 0xff), FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");

/** A deterministic, UUID-shaped id derived from an arbitrary seed string.
 *
 *  Four independently-salted FNV-1a passes give 128 bits, then the version and variant nibbles are
 *  stamped so the result is a well-formed v4-shaped UUID rather than merely 32 hex characters. Every one
 *  of the corpus's 423 real ids is version 4, so a value that only looked like hex would still be the odd
 *  one out in a field where nothing else ever has been.
 *
 *  This is an identifier, not a secret: it needs to be stable and to not collide in a rocket's worth of
 *  components, which is tens of parts, not a cryptographic guarantee. `uniqueUuidFrom` handles the
 *  collision case outright rather than relying on the odds. */
export function uuidFrom(seed: string): string {
  const a = fnv1a(seed, 0x811c9dc5);
  const b = fnv1a(seed, 0x1000193b);
  const c = fnv1a(seed, 0x9e3779b9);
  const d = fnv1a(seed, 0x85ebca6b);
  const raw = hex8(a) + hex8(b) + hex8(c) + hex8(d);
  // Version 4 in the 13th nibble, variant 10xx in the 17th — the two positions RFC 4122 fixes.
  const v = "4" + raw.slice(13, 16);
  const n = (((parseInt(raw[16], 16) & 0x3) | 0x8) >>> 0).toString(16) + raw.slice(17, 20);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${v}-${n}-${raw.slice(20, 32)}`;
}

/** The id to write for a component, given the ids already written in this serialisation.
 *
 *  An id that is already UUID-shaped is written through untouched — that is the case that matters, since
 *  it is what makes an export/re-import round trip preserve identity. Anything else is derived. A
 *  derived value that has already been taken is re-derived from a salted seed rather than being allowed
 *  to alias: two components sharing an id would make every id-addressed operation ambiguous, and R2's
 *  delete resolves its target by id. Deterministic, because the salt is the attempt number and the walk
 *  order is fixed. */
export function uniqueUuidFrom(id: string, taken: Set<string>): string {
  let out = isUuidShaped(id) ? id.toLowerCase() : uuidFrom(id);
  for (let attempt = 1; taken.has(out); attempt++) out = uuidFrom(`${id}#${attempt}`);
  taken.add(out);
  return out;
}
