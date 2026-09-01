import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdownLite } from "./markdown-lite";
import { HKOS_RULES_MARKDOWN } from "./hkosRules";

describe("parseMarkdownLite", () => {
  it("reads headings at every level used by the rules contract", () => {
    const blocks = parseMarkdownLite("# One\n\n## Two\n\n### Three\n\n#### Four\n");
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "One" },
      { type: "heading", level: 2, text: "Two" },
      { type: "heading", level: 3, text: "Three" },
      { type: "heading", level: 4, text: "Four" },
    ]);
  });

  it("joins wrapped lines into one paragraph, split by a blank line", () => {
    const blocks = parseMarkdownLite("First line\nsecond line.\n\nA new paragraph.\n");
    expect(blocks).toEqual([
      { type: "paragraph", text: "First line second line." },
      { type: "paragraph", text: "A new paragraph." },
    ]);
  });

  it("reads a pipe table with its header and rows", () => {
    const blocks = parseMarkdownLite(
      "| Marker | Meaning |\n|---|---|\n| **LOCKED** | Inherited |\n| **DECISION** | Resolved here |\n",
    );
    expect(blocks).toEqual([
      {
        type: "table",
        header: ["Marker", "Meaning"],
        rows: [
          ["**LOCKED**", "Inherited"],
          ["**DECISION**", "Resolved here"],
        ],
      },
    ]);
  });

  it("does not mistake a table separator row for a horizontal rule", () => {
    const blocks = parseMarkdownLite("| A | B |\n|---|---|\n| 1 | 2 |\n");
    expect(blocks.some((block) => block.type === "rule")).toBe(false);
    expect(blocks[0]?.type).toBe("table");
  });

  it("reads a bare horizontal rule as a section break", () => {
    const blocks = parseMarkdownLite("Above\n\n---\n\nBelow\n");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "rule", "paragraph"]);
  });

  it("groups consecutive bullets and numbered items into one list block", () => {
    const bullets = parseMarkdownLite("- one\n- two\n- three\n");
    expect(bullets).toEqual([{ type: "list", ordered: false, items: ["one", "two", "three"] }]);
    const numbered = parseMarkdownLite("1. first\n2. second\n");
    expect(numbered).toEqual([{ type: "list", ordered: true, items: ["first", "second"] }]);
  });

  it("parses the real bundled rules document without throwing and finds its title", () => {
    const blocks = parseMarkdownLite(HKOS_RULES_MARKDOWN);
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks[0]).toEqual({
      type: "heading",
      level: 1,
      text: "Hong Kong Old Style — V1 Rules Contract",
    });
    const tables = blocks.filter((block) => block.type === "table");
    expect(tables.length).toBeGreaterThan(5);
  });
});

describe("parseInline", () => {
  it("splits bold, code and plain text runs", () => {
    expect(parseInline("plain **bold** and `code` end")).toEqual([
      { text: "plain " },
      { bold: "bold" },
      { text: " and " },
      { code: "code" },
      { text: " end" },
    ]);
  });

  it("reduces a markdown link to its visible text", () => {
    expect(parseInline("See [PRD.md](PRD.md) for context.")).toEqual([
      { text: "See " },
      { text: "PRD.md" },
      { text: " for context." },
    ]);
  });
});
