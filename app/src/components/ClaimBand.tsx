import type { JSX } from "react";

import type { Tile as TileType, TileId } from "@engine";

import type { ClaimAction } from "../game/interaction";
import { tileName } from "../game/labels";
import { Tile } from "../tiles/Tile";

/**
 * The contextual claim controls.
 *
 * The band's height is reserved by the layout whether or not it holds
 * anything, so filling it never moves the hand under the player's thumb. When
 * nothing is claimable it stays empty and play continues with no prompt.
 *
 * Win leads the band and Pass trails it, separated by the meld claims and a
 * flexible gap. The two are never adjacent: they are the irreversible choice
 * and the discarding one, and #7 found them side by side to be a defect.
 */

const CLAIM_LABEL: Record<ClaimAction["type"], { han: string; en: string }> = {
  win: { han: "糊", en: "Win" },
  "claim-kong": { han: "槓", en: "Kong" },
  "declare-concealed-kong": { han: "槓", en: "Kong" },
  "declare-added-kong": { han: "槓", en: "Kong" },
  "claim-pung": { han: "碰", en: "Pung" },
  "claim-chow": { han: "食", en: "Chow" },
  pass: { han: "過", en: "Pass" },
};

function contributedTiles(
  action: ClaimAction,
  hand: readonly TileType[],
): readonly TileType[] {
  if (!("tileIds" in action)) return [];
  const byId = new Map(hand.map((tile) => [tile.id, tile]));
  return (action.tileIds as readonly TileId[])
    .map((id) => byId.get(id))
    .filter((tile): tile is TileType => tile !== undefined);
}

export function ClaimBand({
  actions,
  hand,
  onClaim,
  assistOn = false,
  assistHint = null,
}: {
  readonly actions: readonly ClaimAction[];
  readonly hand: readonly TileType[];
  readonly onClaim: (action: ClaimAction) => void;
  /** Assist (#9): rings each legal claim with one more non-colour signal. */
  readonly assistOn?: boolean;
  /**
   * Assist's discard suggestion or waiting-tiles readout, shown only in the
   * band's reserved empty space — it can never displace a real claim, and
   * the two cases it covers (the player's own discard turn, and every other
   * moment) never occur together.
   */
  readonly assistHint?: JSX.Element | null;
}): JSX.Element {
  if (actions.length === 0) {
    return (
      <div className="claimband" role="group" aria-label="No claim available">
        {assistHint}
      </div>
    );
  }

  return (
    <div className="claimband" role="group" aria-label="Claim options">
      {actions.map((action, index) => {
        const label = CLAIM_LABEL[action.type];
        const contributed = contributedTiles(action, hand);
        const previous = actions[index - 1];
        const needsSpacer = action.type === "pass" && previous !== undefined;

        // Several chows can be legal on one discard. Each button shows the two
        // tiles it would spend, so the shapes are told apart by what they cost
        // rather than by their order in the row.
        const detail =
          contributed.length > 0
            ? ` using ${contributed.map((tile) => tileName(tile.kind)).join(" and ")}`
            : "";

        return (
          <div key={`${action.type}-${String(index)}`} style={{ display: "contents" }}>
            {needsSpacer && <span className="claimband__spacer" aria-hidden="true" />}
            <button
              type="button"
              className={`claim claim--${action.type === "pass" ? "pass" : action.type === "win" ? "win" : "meld"}`}
              data-assist={assistOn && action.type !== "pass"}
              onClick={() => { onClaim(action); }}
              aria-label={`${label.en}${detail}`}
            >
              <span className="claim__han" aria-hidden="true">
                {label.han}
              </span>
              <span className="claim__en" aria-hidden="true">
                {label.en}
              </span>
              {contributed.length > 0 && (
                <span className="claim__tiles" aria-hidden="true">
                  {contributed.map((tile) => (
                    <Tile key={tile.id} kind={tile.kind} variant="discard" />
                  ))}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
