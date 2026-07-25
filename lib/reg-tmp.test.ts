import { describe, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { importDesign } from "./ork/import";
import { runFromDocument } from "./sim/run";
describe("reg", () => {
  it("bundled samples", async () => {
    const out: string[] = [];
    for (const f of ["demo-single-deploy.ork", "demo-dual-deploy.ork", "demo-boattail.ork", "demo-multi-config.ork", "demo-payload-separation.ork", "demo-quirks.ork"]) {
      const doc = await importDesign(new Uint8Array(readFileSync(`fixtures/${f}`)));
      const run = runFromDocument(doc);
      const v = run.validation;
      out.push(`${f}: mape=${v ? v.mape.toFixed(1) : "n/a"} ` + (v?.comparisons ?? []).map((c) => `${c.key}=${c.pctError.toFixed(0)}%`).join(" "));
    }
    writeFileSync("/tmp/claude-0/-home-user/6d25ab06-40e1-5ebd-bc75-97e3a57c37a9/scratchpad/reg.out", out.join("\n"));
  }, 300000);
});
