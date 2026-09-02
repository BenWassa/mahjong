import { useEffect, useState, type JSX } from "react";

import type { TableGeometry } from "../game/geometry";

/**
 * The layout HUD, behind `?layoutdebug=1`.
 *
 * Three kinds of number, side by side, because a responsive bug is almost
 * always a disagreement between two of them:
 *
 *  - what the phone reports (viewport, visual viewport, insets, DPR);
 *  - what the geometry engine decided from that (tile sizes, tier, slack);
 *  - what the browser actually drew (measured region rectangles).
 *
 * A tile computed at 40px and drawn at 24px is a stylesheet bug; a tile
 * computed at 24px is a geometry bug; a viewport 60px shorter than the screen
 * is a browser-chrome bug. Reading one of those three alone cannot tell them
 * apart, which is why they are on one panel.
 *
 * It is deliberately plain and small, it never blocks a tap on the table
 * beneath it, and it can be collapsed to a single line or moved to the other
 * corner — on a 320px-tall phone anything pinned over the felt is in the way of
 * the thing being diagnosed.
 */

/** The regions worth measuring, in the order they stack down the screen. */
const REGIONS: readonly { readonly label: string; readonly selector: string }[] = [
  { label: "app", selector: ".app" },
  { label: "coach", selector: ".coach" },
  { label: "table", selector: ".table" },
  { label: "tabletop", selector: ".tabletop" },
  { label: "well", selector: ".well" },
  { label: "pile", selector: ".well__grid" },
  { label: "claimband", selector: ".claimband" },
  { label: "handrow", selector: ".handrow" },
  { label: "slot", selector: ".hand__slot" },
  { label: "peek", selector: ".peek__panel" },
];

interface Measured {
  readonly regions: readonly { readonly label: string; readonly text: string }[];
  readonly drawnTileW: number | null;
  readonly overflowX: number;
  readonly overflowY: number;
  readonly visualW: number;
  readonly visualH: number;
  readonly dpr: number;
}

function measure(): Measured {
  const doc = document.documentElement;
  const regions = REGIONS.flatMap((region) => {
    const node = document.querySelector(region.selector);
    if (node === null) return [];
    const rect = node.getBoundingClientRect();
    return [
      {
        label: region.label,
        text: `${String(Math.round(rect.width))}×${String(Math.round(rect.height))} @${String(Math.round(rect.left))},${String(Math.round(rect.top))}`,
      },
    ];
  });

  // The drawn tile, read off the slots rather than off the custom property.
  // Learn to Play's portrait stylesheet re-declares --tile-w on the hand row
  // on purpose, so the ancestor's value is not always what ends up applied.
  const slots = [...document.querySelectorAll(".hand__slot")];
  const drawnTileW = slots.length
    ? Math.min(...slots.map((node) => node.getBoundingClientRect().width))
    : null;

  return {
    regions,
    drawnTileW,
    overflowX: doc.scrollWidth - doc.clientWidth,
    overflowY: doc.scrollHeight - doc.clientHeight,
    visualW: Math.round(window.visualViewport?.width ?? window.innerWidth),
    visualH: Math.round(window.visualViewport?.height ?? window.innerHeight),
    dpr: window.devicePixelRatio,
  };
}

export function LayoutDebug({ geometry }: { readonly geometry: TableGeometry }): JSX.Element {
  const [open, setOpen] = useState(true);
  const [corner, setCorner] = useState<"start" | "end">("start");
  const [measured, setMeasured] = useState<Measured | null>(null);

  /*
   * Polled rather than observed. The interesting rectangles change for reasons
   * a ResizeObserver on any one node does not see — a claim band filling, the
   * pile growing a row, the address bar retracting mid-turn — and half a second
   * is both fast enough to watch a layout settle and cheap enough to leave
   * running on a phone. It only runs while the panel is expanded.
   */
  useEffect(() => {
    if (!open) return undefined;
    setMeasured(measure());
    const timer = window.setInterval(() => { setMeasured(measure()); }, 500);
    return () => { window.clearInterval(timer); };
  }, [open]);

  const { viewport, policy } = geometry;
  // What the browser actually drew, next to what the engine asked for. A gap
  // between the two is a stylesheet overriding the geometry — which Learn to
  // Play's portrait hand does on purpose, and nothing else should.
  const drawn =
    measured?.drawnTileW === undefined || measured.drawnTileW === null
      ? "—"
      : `${String(Math.round(measured.drawnTileW))}px`;

  if (!open) {
    return (
      <button
        type="button"
        className="layoutdebug layoutdebug--closed"
        data-corner={corner}
        onClick={() => { setOpen(true); }}
      >
        {viewport.width}×{viewport.height} · {geometry.tileW}px · {policy.tier}
        {geometry.breaches.length > 0 ? ` · ${String(geometry.breaches.length)}!` : ""}
      </button>
    );
  }

  return (
    <aside className="layoutdebug" data-corner={corner} aria-label="Layout diagnostics">
      <div className="layoutdebug__bar">
        <span className="layoutdebug__title">layout</span>
        <button
          type="button"
          onClick={() => { setCorner((current) => (current === "start" ? "end" : "start")); }}
        >
          move
        </button>
        <button type="button" onClick={() => { setOpen(false); }}>
          hide
        </button>
      </div>

      <dl className="layoutdebug__rows">
        <Row
          label="viewport"
          value={`${String(viewport.width)}×${String(viewport.height)} ${geometry.orientation} dpr ${String(measured?.dpr ?? 1)}`}
        />
        <Row
          label="visual"
          value={
            measured === null
              ? "—"
              : `${String(measured.visualW)}×${String(measured.visualH)}`
          }
        />
        <Row
          label="safe area"
          value={`T${String(viewport.safeTop)} R${String(viewport.safeRight)} B${String(viewport.safeBottom)} L${String(viewport.safeLeft)}`}
        />
        <Row
          label="usable"
          value={`${String(geometry.usableWidth)}×${String(geometry.usableHeight)} · slack w${String(geometry.widthSlack)} h${String(geometry.heightSlack)}`}
        />
        <Row
          label="state"
          value={`${policy.tier} · chrome ${yn(policy.showChrome)} · seat meta ${yn(policy.showSeatMeta)} · seat melds ${yn(policy.showSeatMelds)}`}
        />
        <Row
          label="hand tile"
          value={`${String(geometry.tileW)}×${String(geometry.tileH)} gap ${String(geometry.tileGap)} · ${String(geometry.handSlots)} slots · row ${String(geometry.handWidth)}px · drawn ${drawn}`}
        />
        <Row
          label="other tiles"
          value={`discard ${String(geometry.discardTileW)} (${String(geometry.discardColumns)}×${String(geometry.discardRows)}) · opp ${String(geometry.oppTileW)} · meld ${String(geometry.meldTileW)} · peek ${String(geometry.peekTileW)}`}
        />
        <Row
          label="overflow"
          value={
            measured === null
              ? "—"
              : `x ${String(measured.overflowX)} · y ${String(measured.overflowY)}`
          }
        />
        <Row
          label="regions"
          value={
            measured === null
              ? "—"
              : measured.regions.map((region) => `${region.label} ${region.text}`).join(" · ")
          }
        />
        <Row
          label="breaches"
          value={
            geometry.breaches.length === 0
              ? "none"
              : geometry.breaches
                  .map(
                    (breach) =>
                      `${breach.id} needs ${String(breach.need)}, got ${String(Math.round(breach.got))}`,
                  )
                  .join(" · ")
          }
          alert={geometry.breaches.length > 0}
        />
      </dl>
    </aside>
  );
}

function Row({
  label,
  value,
  alert = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly alert?: boolean;
}): JSX.Element {
  return (
    <div className="layoutdebug__row" data-alert={alert}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function yn(value: boolean): string {
  return value ? "on" : "off";
}
