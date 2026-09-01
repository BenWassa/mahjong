import { useEffect, type JSX } from "react";

import { CONCEPTS, type ConceptId } from "../game/explain";

/**
 * Explain's non-modal banner (#9). It never gates a legal action: the table
 * beneath it stays fully interactive while it is up, and it clears itself
 * after a few seconds so routine play resumes without a tap.
 */
export function ExplainBanner({
  concept,
  onDismiss,
}: {
  readonly concept: ConceptId;
  readonly onDismiss: () => void;
}): JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 7000);
    return () => { window.clearTimeout(timer); };
  }, [concept, onDismiss]);

  const { title, body } = CONCEPTS[concept];

  return (
    <div className="explain" role="status">
      <div className="explain__text">
        <p className="explain__title">{title}</p>
        <p className="explain__body">{body}</p>
      </div>
      <button type="button" className="explain__dismiss" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
