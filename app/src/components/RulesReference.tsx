import { Fragment, useMemo, type JSX, type ReactNode } from "react";

import { HKOS_RULES_MARKDOWN } from "../game/hkosRules";
import { type Block, type InlineToken, parseInline, parseMarkdownLite } from "../game/markdown-lite";

/**
 * The static, offline rules reference (#9), reachable from the menu. It
 * renders the bundled text of docs/HKOS_RULES.md verbatim through the
 * markdown-lite reader, so it can never drift from the document that is
 * authoritative for rules and scoring: the two are the same bytes.
 */
export function RulesReference({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const blocks = useMemo(() => parseMarkdownLite(HKOS_RULES_MARKDOWN), []);

  return (
    <div className="rules" role="region" aria-label="Rules reference">
      <header className="rules__head">
        <h1 className="rules__title">Rules reference</h1>
        <button type="button" className="rules__close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="rules__body">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </div>
  );
}

const HEADING_TAGS = ["h2", "h3", "h4", "h5"] as const;

function BlockView({ block }: { readonly block: Block }): JSX.Element | null {
  switch (block.type) {
    case "heading": {
      const Tag = HEADING_TAGS[Math.min(block.level - 1, HEADING_TAGS.length - 1)] ?? "h5";
      return (
        <Tag className={`rules__h${String(block.level)}`}>
          <Inline text={block.text} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="rules__p">
          <Inline text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="rules__list">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="rules__tablewrap">
          <table className="rules__table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr className="rules__hr" />;
  }
}

function Inline({ text }: { readonly text: string }): JSX.Element {
  const tokens = parseInline(text);
  return (
    <>
      {tokens.map((token, index) => (
        <Fragment key={index}>{renderToken(token)}</Fragment>
      ))}
    </>
  );
}

function renderToken(token: InlineToken): ReactNode {
  if ("bold" in token) return <strong>{token.bold}</strong>;
  if ("code" in token) return <code>{token.code}</code>;
  return token.text;
}
