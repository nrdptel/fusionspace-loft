import { describe, it, expect } from "vitest";
import { parseXml, child, children, childText, childNum, parseNum } from "./xml";

describe("parseXml", () => {
  it("parses elements, attributes, nesting and text", () => {
    const root = parseXml(
      `<?xml version='1.0'?><a x="1"><b>hi</b><b>yo</b><c self="y"/></a>`,
    );
    expect(root.name).toBe("a");
    expect(root.attrs.x).toBe("1");
    expect(children(root, "b").map((n) => n.text)).toEqual(["hi", "yo"]);
    expect(child(root, "c")?.attrs.self).toBe("y");
  });

  it("skips comments and the declaration", () => {
    const root = parseXml(`<!-- c --><r><!-- inner --><v>3</v></r>`);
    expect(childText(root, "v")).toBe("3");
  });

  it("decodes entities", () => {
    const root = parseXml(`<r><n>a &lt; b &amp;&amp; c</n></r>`);
    expect(childText(root, "n")).toBe("a < b && c");
  });

  it("tolerates OpenRocket numeric tokens", () => {
    expect(parseNum("auto 0.025")).toBeCloseTo(0.025);
    expect(parseNum("auto")).toBeNaN();
    expect(parseNum("filled")).toBeNaN();
    expect(parseNum("5.0E-4")).toBeCloseTo(0.0005);
    expect(parseNum("none")).toBeNaN();
    const root = parseXml(`<r><len>0.5</len></r>`);
    expect(childNum(root, "len")).toBe(0.5);
    expect(childNum(root, "missing", 9)).toBe(9);
  });

  it("throws only when there is no element at all", () => {
    expect(() => parseXml("   ")).toThrow();
  });
});
