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
 *  these are floored at zero and open above, and "0 to –" reads as a range that failed to load. */
export function rangeWords(min?: number, max?: number): string | undefined {
  if (min !== undefined && max !== undefined) return `${min} to ${max}`;
  if (min !== undefined) return `${min} or more`;
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
