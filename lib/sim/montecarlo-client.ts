/** Runs a Monte-Carlo dispersion in the background so the UI doesn't freeze while a few hundred
 *  flights compute. Like the sweep client, the static-export toolchain can't bundle a Web Worker
 *  module, so the work runs on the main thread in small batches that yield to the event loop
 *  between them — the spinner renders, clicks and scrolls are handled, and the run is abortable.
 *  Results are identical to the synchronous `monteCarlo`; this only changes WHEN the work happens. */

import type { Rocket } from "../model/types";
import {
  monteCarloSamples,
  summarizeSamples,
  type MonteCarloOptions,
  type MonteCarloResult,
  type MonteCarloSample,
} from "./montecarlo";

/** Flights per batch before yielding — a batch is a few tens of ms, short enough to stay responsive. */
const BATCH = 8;

/** Emit a partial summary every this many batches, so the UI can draw the cloud as it forms without
 *  re-summarizing (a cheap sort) or re-rendering the charts on every single flight. */
const PARTIAL_EVERY = 2;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** True once the caller has abandoned this run (inputs changed); checked between batches to bail. */
export type Aborted = () => boolean;

/** Fly the dispersed samples a batch at a time, yielding between batches — the async, non-blocking
 *  counterpart of `monteCarlo`. Returns the summarized distribution, or null if aborted mid-run.
 *  `onPartial`, when given, receives a summary of the samples flown so far every few batches, so the
 *  caller can render the distribution and landing cloud as they fill in rather than after the whole
 *  run — the final return value is identical either way. */
export async function runMonteCarlo(
  rocket: Rocket,
  opts: MonteCarloOptions,
  aborted?: Aborted,
  onProgress?: (done: number, total: number) => void,
  onPartial?: (result: MonteCarloResult) => void,
): Promise<MonteCarloResult | null> {
  const samples: MonteCarloSample[] = [];
  let processed = 0;
  let batches = 0;
  for (const s of monteCarloSamples(rocket, opts)) {
    samples.push(s);
    if (++processed % BATCH === 0) {
      if (aborted?.()) return null;
      onProgress?.(processed, opts.n);
      // A running preview of the cloud, refreshed periodically (not every flight) to keep the charts
      // cheap; only once some flights have actually landed, so the preview is never an empty plot.
      if (onPartial && ++batches % PARTIAL_EVERY === 0 && samples.length > 0) {
        onPartial(summarizeSamples(samples));
      }
      await yieldToEventLoop();
    }
  }
  if (aborted?.()) return null;
  return summarizeSamples(samples);
}
