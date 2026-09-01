import type { ClaimOption } from "../model/table.ts";
import type { ControlPlacement } from "../model/settings.ts";

export interface ClaimControlsProps {
  readonly claims: readonly ClaimOption[];
  readonly placement: ControlPlacement;
  readonly enabled: boolean;
  readonly onClaim: (claimId: string) => void;
  readonly onPass: () => void;
}

/**
 * Contextual claim controls, per PRD §7: no permanent control row, and Win is
 * never adjacent to Pass. The container is always mounted so its space is
 * reserved; only its contents are contextual. Reserving the space is what stops
 * the hand from resizing between a claim and a plain turn — a resizing hand
 * would make the legibility question unanswerable.
 *
 * Pass is rendered first and pushed to the far end by a growing spacer, so the
 * two controls whose confusion is most expensive — passing on a win — sit at
 * opposite ends of the control area in both layouts. Win takes the position
 * nearest the resting thumb.
 */
export function ClaimControls({
  claims,
  placement,
  enabled,
  onClaim,
  onPass,
}: ClaimControlsProps): React.JSX.Element {
  const wins = claims.filter((claim) => claim.kind === "win");
  const others = claims.filter((claim) => claim.kind !== "win");
  const showing = enabled && claims.length > 0;

  return (
    <div
      className={`claims claims--${placement}${showing ? " is-live" : ""}`}
      aria-live="polite"
      aria-label="Claim controls"
    >
      {showing && (
        <>
          <button type="button" className="claim claim--pass" onClick={onPass}>
            <span className="claim__glyph">過</span>
            <span className="claim__gloss">Pass</span>
          </button>
          <span className="claims__separator" aria-hidden="true" />
          {others.map((claim) => (
            <ClaimButton key={claim.id} claim={claim} variant="claim" onClaim={onClaim} />
          ))}
          {wins.map((claim) => (
            <ClaimButton key={claim.id} claim={claim} variant="win" onClaim={onClaim} />
          ))}
        </>
      )}
    </div>
  );
}

function ClaimButton({
  claim,
  variant,
  onClaim,
}: {
  claim: ClaimOption;
  variant: "win" | "claim";
  onClaim: (claimId: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`claim claim--${variant}`}
      onClick={() => {
        onClaim(claim.id);
      }}
    >
      <span className="claim__glyph">{claim.glyph}</span>
      <span className="claim__gloss">{claim.gloss}</span>
      {claim.detail !== null && <span className="claim__detail">{claim.detail}</span>}
    </button>
  );
}
