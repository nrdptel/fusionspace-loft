/** How a what-if field talks about a value it will not fly.
 *
 *  There are two of these fields, in two files — the design editor's (`Num` in `LoftApp.tsx`) and
 *  the analysis panels' (`NumberField` in `components/ui.tsx`) — and they ask the flyer for the
 *  same thing in the same gesture. A flyer who learns what a refused entry looks like in one has
 *  learned it in both, so the sentence lives here rather than being written twice and drifting.
 *
 *  The complaint a refused entry answers is not "that was rejected". It is "then what is being
 *  flown?" — so naming the value actually in the flight is the load-bearing half of the message. */

/** A field's range in words. A bound the field doesn't have is SAID, not left as a dash: most of
 *  these are floored at zero and open above, and "0 to –" reads as a range that failed to load.
 *
 *  `minExclusive` is the difference between "0 or more" and "more than 0", and on these fields it
 *  is not a nicety: a rail of no length, a body tube of no diameter and a fin of no thickness are
 *  not small values, they are absent parts, and a field that advertises "0 or more" has told the
 *  flyer that zero is one of the answers it takes. */
export function rangeWords(min?: number, max?: number, minExclusive?: boolean): string | undefined {
  if (min !== undefined && max !== undefined)
    return minExclusive ? `more than ${min}, up to ${max}` : `${min} to ${max}`;
  if (min !== undefined) return minExclusive ? `more than ${min}` : `${min} or more`;
  if (max !== undefined) return `up to ${max}`;
  return undefined;
}

/** What to say about an entry the field will not fly.
 *
 *  @param entry  the text the flyer typed, repeated back so they can see it was read
 *  @param ranged what the field will take, from `rangeWords`
 *  @param flown  the value the flight is using instead — omitted only when there is nothing to name */
export function refusedMessage(entry: string, ranged?: string, flown?: string): string {
  return `${entry} isn't a value this can fly${ranged ? ` (${ranged})` : ""}${flown ? ` — flying ${flown}` : ""}.`;
}

/** A list of field names as a sentence reads it: "a", "a and b", "a, b, and c". Comma-joining alone
 *  produced "no rail length, rail angle, surface wind, field elevation", which reads as a truncated
 *  list rather than a complete one — and the sentence it sits in is telling a flyer which of their
 *  launch numbers their file did not supply, so being read as truncated is the wrong failure. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
