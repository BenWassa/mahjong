import { useCallback, useEffect, useState, type JSX } from "react";

import { TableView } from "./components/TableView";
import { useGameSession } from "./game/useGameSession";
import type { CornerLabelMode } from "./tiles/Tile";

/**
 * Orientation is a screen-level property (PRD §7). The table is landscape
 * because fourteen tiles have to be simultaneously readable; the menu is the
 * portrait surface. Neither orientation is forced: the app responds to the one
 * the phone is in, and says plainly what the other one is for.
 */
function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= window.innerHeight,
  );
  useEffect(() => {
    const update = (): void => { setLandscape(window.innerWidth >= window.innerHeight); };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return landscape;
}

const LABEL_MODES: readonly CornerLabelMode[] = ["off", "rank", "rank-suit"];
const LABEL_NAME: Record<CornerLabelMode, string> = {
  off: "Off",
  rank: "Rank",
  "rank-suit": "Rank and suit",
};

function initialSeed(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("seed") ?? `hand-${String(Date.now())}`;
}

export function App(): JSX.Element {
  const landscape = useIsLandscape();
  const [seed] = useState(initialSeed);
  const [cornerLabel, setCornerLabel] = useState<CornerLabelMode>("off");
  const session = useGameSession(seed);

  const cycleLabel = useCallback(() => {
    setCornerLabel((current) => {
      const next = LABEL_MODES[(LABEL_MODES.indexOf(current) + 1) % LABEL_MODES.length];
      return next ?? "off";
    });
  }, []);

  if (!landscape) {
    return (
      <div className="portrait">
        <h1 className="portrait__title">
          <span className="portrait__han" aria-hidden="true">麻雀</span>
          Mahjong
        </h1>
        <p className="portrait__note">Hong Kong Old Style</p>

        <p className="portrait__prompt">
          Turn the phone sideways to play. Fourteen tiles have to be readable at
          once, and portrait cannot seat them at a size worth reading.
        </p>

        <div className="portrait__setting">
          <span id="label-mode">Corner labels</span>
          <button
            type="button"
            className="portrait__toggle"
            aria-describedby="label-mode"
            onClick={cycleLabel}
          >
            {LABEL_NAME[cornerLabel]}
          </button>
        </div>
        <p className="portrait__hint">
          Labels are a learning layer over the traditional face. They never
          replace it.
        </p>
      </div>
    );
  }

  return <TableView session={session} cornerLabel={cornerLabel} />;
}
