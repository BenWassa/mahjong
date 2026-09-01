import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RulesReference } from "./RulesReference";

/**
 * The offline rules reference (#9) renders the bundled docs/HKOS_RULES.md
 * text through the markdown-lite reader; markdown-lite.test.ts already
 * covers the parser itself, so this only checks that the component wires it
 * up: real content reaches the page, and the close control is reachable.
 */
describe("RulesReference", () => {
  const markup = renderToStaticMarkup(<RulesReference onClose={() => undefined} />);

  it("renders the rules document's real title and a chunk of its content", () => {
    expect(markup).toContain("Hong Kong Old Style");
    expect(markup).toContain("V1 Rules Contract");
    // A phrase from deep in the document, to prove the whole file made it
    // through rather than a truncated head.
    expect(markup).toContain("Robbing a kong");
  });

  it("renders at least one real table from the faan section", () => {
    expect(markup).toContain("<table");
    expect(markup).toContain("Common Hand");
  });

  it("gives the close control a real, labelled button", () => {
    expect(markup).toMatch(/<button[^>]*>\s*Close\s*<\/button>/);
  });
});
