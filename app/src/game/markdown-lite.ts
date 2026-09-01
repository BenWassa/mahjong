/**
 * The smallest markdown reader that can render docs/HKOS_RULES.md faithfully:
 * headings, paragraphs, bulleted/numbered lists, pipe tables, horizontal
 * rules, and inline bold/code/links. Deliberately not a general markdown
 * parser — it exists once, for the offline rules reference (#9), so that the
 * reference can render the bundled document's exact text rather than a
 * hand-transcribed copy that could drift from it.
 */

export type InlineToken =
  | { readonly text: string }
  | { readonly bold: string }
  | { readonly code: string };

export type Block =
  | { readonly type: "heading"; readonly level: 1 | 2 | 3 | 4; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | {
      readonly type: "table";
      readonly header: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly type: "rule" };

const HEADING = /^(#{1,4})\s+(.*)$/;
const ORDERED_ITEM = /^\d+\.\s+(.*)$/;
const BULLET_ITEM = /^[-*]\s+(.*)$/;
const HR = /^-{3,}\s*$/;
const TABLE_ROW = /^\|(.+)\|\s*$/;
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\([^)]+\)/g;

function splitCells(row: string): readonly string[] {
  return row.split("|").map((cell) => cell.trim());
}

export function parseMarkdownLite(source: string): readonly Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  const paragraphBuffer: string[] = [];
  const flushParagraph = (): void => {
    if (paragraphBuffer.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraphBuffer.join(" ").trim() });
    paragraphBuffer.length = 0;
  };

  let index = 0;
  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();

    if (trimmed === "") {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const tableHeader = TABLE_ROW.exec(trimmed);
    const separatorLine = lines[index + 1]?.trim();
    const separator = separatorLine !== undefined ? TABLE_ROW.exec(separatorLine) : null;
    if (
      tableHeader?.[1] !== undefined &&
      separator?.[1] !== undefined &&
      splitCells(separator[1]).every((cell) => TABLE_SEPARATOR_CELL.test(cell))
    ) {
      flushParagraph();
      const header = splitCells(tableHeader[1]);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = TABLE_ROW.exec((lines[index] ?? "").trim());
        if (row?.[1] === undefined) break;
        rows.push([...splitCells(row[1])]);
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (HR.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const isOrdered = ORDERED_ITEM.test(trimmed);
    const isBullet = BULLET_ITEM.test(trimmed);
    if (isOrdered || isBullet) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? "").trim();
        const match = isOrdered ? ORDERED_ITEM.exec(candidate) : BULLET_ITEM.exec(candidate);
        if (match?.[1] === undefined) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    paragraphBuffer.push(trimmed);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

export function parseInline(text: string): readonly InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) tokens.push({ text: text.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ bold: match[1] });
    else if (match[2] !== undefined) tokens.push({ code: match[2] });
    else if (match[3] !== undefined) tokens.push({ text: match[3].replace(/`/g, "") });
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}
