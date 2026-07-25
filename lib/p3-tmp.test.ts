import { describe, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { importDesign } from "./ork/import";
import { runFromDocument, overridesFromStored } from "./sim/run";
import { dryMassProperties } from "./sim/mass";
import { crossCheckSeries, dragAgreement } from "./validation/crosscheck";

const F = "/home/user/loft-fixtures/openrocket/openrocket__openrocket-repo-rasaero-threestage__03.Three-stage.ork";
describe("p3", () => {
  it("three stage", async () => {
    const doc = await importDesign(new Uint8Array(readFileSync(F)));
    const out: string[] = [];
    out.push("warnings: " + JSON.stringify(doc.warnings));
    out.push("reduced=" + doc.flownAsReduced + " stages=" + doc.rocket.stages.length + " dry=" + dryMassProperties(doc.rocket).mass.toFixed(3) + "kg");
    for (const st of doc.rocket.stages) out.push(`  stage "${st.name}": ${st.components.map((c) => `${c.kind}(${c.name})`).join(", ")} sepEvent=${st.separationEvent ?? "-"} sepDelay=${st.separationDelay ?? "-"}`);
    for (const cfg of doc.rocket.configurations) out.push(`  cfg ${cfg.id}: ` + cfg.instances.map((i) => `${i.motor.manufacturer} ${i.motor.designation} delay=${i.motor.delay} ign=${i.ignitionDelay}`).join(" | "));
    doc.simulations.forEach((s) => {
      const run = runFromDocument(doc, { configId: s.conditions.configId, validateAgainst: s, overrides: overridesFromStored(s) });
      out.push(`[${s.name}] prop=${run.hasPropulsion} res=${run.resolutions.map((r) => `${r.designation}->${r.match ? r.match.entry.designation : "NONE"}`).join(",")}`);
      for (const c of run.validation?.comparisons ?? []) out.push(`   ${c.label}: ${c.stored.toFixed(2)} → ${c.simulated.toFixed(2)} (${c.pctError.toFixed(1)}%)`);
      out.push("   events: " + run.result.events.map((e) => `${e.type}@${e.time.toFixed(2)}s/${e.altitude.toFixed(0)}m`).join(" "));
      if (s.flightData) {
        const cc = crossCheckSeries(run.result, s.flightData);
        out.push("   dragAgreement: " + JSON.stringify(dragAgreement(cc)));
        const at = (arr: {x:number;y:number}[], t: number) => { let b = arr[0]; for (const p of arr) if (Math.abs(p.x - t) < Math.abs(b.x - t)) b = p; return b; };
        for (const t of [0.5, 1, 2, 4, 8, 15]) {
          const a = cc.storedCd?.length ? at(cc.storedCd, t) : undefined; const l = cc.loftCd?.length ? at(cc.loftCd, t) : undefined;
          if (a && l) out.push(`     t=${t}s OR Cd=${a.y.toFixed(3)} Loft Cd=${l.y.toFixed(3)} ratio=${(l.y/a.y).toFixed(2)}`);
        }
        const alt = s.flightData.points;
        out.push("   stored alt samples: " + [0.5,1,2,4,8,15,25].map((t)=>{let b=alt[0];for(const p of alt) if(Math.abs(p.time-t)<Math.abs(b.time-t)) b=p; return `${t}s:${b.altitude.toFixed(0)}m/${b.velocity.toFixed(0)}mps`;}).join(" "));
      }
    });
    writeFileSync("/tmp/claude-0/-home-user/6d25ab06-40e1-5ebd-bc75-97e3a57c37a9/scratchpad/p3.out", out.join("\n"));
  }, 300000);
});
