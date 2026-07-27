/** What to put on screen when the second solver fails.
 *
 *  RocketPy runs as real CPython under WASM, so when a flight fails what comes back is a Python
 *  traceback: a stack of frames through Pyodide, RocketPy and fly.py, with the line a reader can
 *  actually act on — the exception type and its message — at the very bottom. Rendering that blob
 *  as the panel's only message fails a flyer twice over. The useful line is buried under frames
 *  they did not write, and the longest frame path is one unbreakable token, so at phone width it
 *  shoves the whole page sideways.
 *
 *  So: lead with the last line and keep the rest. Nothing is discarded, nothing is reworded, and
 *  nothing is guessed at — this does not try to classify the failure into a cause, because the
 *  guess would be wrong exactly when it mattered, and a flyer reporting the problem needs
 *  RocketPy's own words, not a paraphrase of them. */

/** Said when the engine failed but supplied no words at all — better than a bare colon. */
const SILENT = "it stopped without saying why";

export interface EngineFailure {
  /** The one line worth reading first. Python puts the exception and its message last. */
  headline: string;
  /** The full report, or "" when it holds nothing the headline doesn't already say. */
  detail: string;
}

/** Split an engine failure into the line to lead with and the report behind it. */
export function engineFailure(message: string): EngineFailure {
  const full = message.replace(/\s+$/, "");
  const lines = full.split("\n").filter((l) => l.trim() !== "");
  const headline = lines.length > 0 ? lines[lines.length - 1].trim() : SILENT;
  // One line of substance is the whole report — offering to expand it onto itself is a dead end.
  return { headline, detail: lines.length > 1 ? full : "" };
}
