import { describe, it, expect } from "vitest";
import { readOrkXml } from "./zip";

const RAW = `<?xml version='1.0'?><openrocket version="1.10"><rocket><name>Raw</name></rocket></openrocket>`;

async function gzip(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const stream = new Response(new TextEncoder().encode(text)).body!.pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("readOrkXml", () => {
  it("passes through raw XML", async () => {
    const xml = await readOrkXml(new TextEncoder().encode(RAW));
    expect(xml).toContain("<openrocket");
  });

  it("inflates a gzip-wrapped design", async () => {
    const bytes = await gzip(RAW);
    expect(bytes[0]).toBe(0x1f);
    const xml = await readOrkXml(bytes);
    expect(xml).toContain("Raw");
  });
});
