/** A small, dependency-free XML parser producing a lightweight DOM. OpenRocket's
 *  `rocket.ork` is plain namespaced-free UTF-8 XML (elements, attributes, text, comments),
 *  so a compact recursive parser covers it and — unlike the browser's DOMParser — runs the
 *  same in Node (tests) and the browser. It degrades gracefully: unknown constructs are
 *  skipped, never thrown on, matching the "degrade gracefully on unknowns" requirement. */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content. */
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // last, so a literal &amp;lt; survives
}

/** Parse an XML string into a root node. Throws only if there is no element at all. */
export function parseXml(input: string): XmlNode {
  let i = 0;
  const n = input.length;

  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];

  const skipDeclOrComment = (): boolean => {
    if (input.startsWith("<?", i)) {
      const end = input.indexOf("?>", i);
      i = end === -1 ? n : end + 2;
      return true;
    }
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i);
      i = end === -1 ? n : end + 3;
      return true;
    }
    if (input.startsWith("<![CDATA[", i)) {
      const end = input.indexOf("]]>", i);
      const content = input.slice(i + 9, end === -1 ? n : end);
      stack[stack.length - 1].text += content;
      i = end === -1 ? n : end + 3;
      return true;
    }
    if (input.startsWith("<!", i)) {
      // DOCTYPE or similar — skip to the next '>'.
      const end = input.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      return true;
    }
    return false;
  };

  while (i < n) {
    if (input[i] === "<") {
      if (skipDeclOrComment()) continue;

      if (input.startsWith("</", i)) {
        // Closing tag.
        const end = input.indexOf(">", i);
        if (end === -1) break;
        if (stack.length > 1) stack.pop();
        i = end + 1;
        continue;
      }

      // Opening (or self-closing) tag.
      const end = input.indexOf(">", i);
      if (end === -1) break;
      let tag = input.slice(i + 1, end).trim();
      const selfClosing = tag.endsWith("/");
      if (selfClosing) tag = tag.slice(0, -1).trim();

      const spaceIdx = tag.search(/\s/);
      const name = spaceIdx === -1 ? tag : tag.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1 ? "" : tag.slice(spaceIdx + 1);

      const node: XmlNode = { name, attrs: parseAttrs(attrStr), children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      i = end + 1;
    } else {
      // Text content up to the next tag.
      const next = input.indexOf("<", i);
      const raw = input.slice(i, next === -1 ? n : next);
      const trimmed = raw.trim();
      if (trimmed) stack[stack.length - 1].text += decodeEntities(trimmed);
      i = next === -1 ? n : next;
    }
  }

  const el = root.children.find((c) => c.name !== "#root");
  if (!el) throw new Error("xml: no root element found");
  return el;
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

// --- small navigation helpers --------------------------------------------------------

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

export function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/** Direct text of a named child, or undefined. */
export function childText(node: XmlNode, name: string): string | undefined {
  return child(node, name)?.text;
}

/** Parse a numeric child, tolerating OpenRocket tokens ("auto", "auto 0.02", "filled",
 *  "none", "NaN", "Inf"). Returns `fallback` when absent or non-numeric. */
export function childNum(node: XmlNode, name: string, fallback = NaN): number {
  const t = childText(node, name);
  return parseNum(t, fallback);
}

export function parseNum(t: string | undefined, fallback = NaN): number {
  if (t === undefined) return fallback;
  const s = t.trim();
  if (s === "" || s === "filled" || s === "none") return fallback;
  if (s === "NaN") return NaN;
  if (s === "Inf") return Infinity;
  if (s === "-Inf") return -Infinity;
  // "auto 0.025" ⇒ take the numeric part; bare "auto" ⇒ fallback.
  const m = s.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
  return m ? Number(m[0]) : fallback;
}
