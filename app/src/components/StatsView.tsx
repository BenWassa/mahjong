import { useMemo, type JSX } from "react";

import { loadCompletedGames } from "../game/persistence";
import { computeStats } from "../game/stats";

const PERCENT = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/**
 * Basic personal stats (#10): a pure read over completed match records, with
 * no analytics and no accounts. Computed once on open from whatever is
 * already on the device — opening this screen can never change a stored
 * record or a live game.
 */
export function StatsView({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const stats = useMemo(() => computeStats(loadCompletedGames()), []);

  return (
    <div className="rules" role="region" aria-label="Stats">
      <header className="rules__head">
        <h1 className="rules__title">Stats</h1>
        <button type="button" className="rules__close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="rules__body">
        {stats.handsPlayed === 0 ? (
          <p className="rules__p">
            No completed matches yet. Stats are read from finished matches only
            — play one east round through to the end and it will show up here.
          </p>
        ) : (
          <>
            <dl className="stats__grid">
              <StatTile label="Hands played" value={String(stats.handsPlayed)} />
              <StatTile label="Hands won" value={String(stats.handsWon)} />
              <StatTile label="Win rate" value={PERCENT.format(stats.winRate)} />
              <StatTile label="Average faan" value={ONE_DECIMAL.format(stats.averageFaan)} />
              <StatTile label="Deal-ins" value={String(stats.dealInCount)} />
            </dl>

            <h2 className="rules__h2">Most frequent scoring patterns</h2>
            {stats.mostFrequentPatterns.length === 0 ? (
              <p className="rules__p">No wins recorded yet.</p>
            ) : (
              <ul className="rules__list">
                {stats.mostFrequentPatterns.map((pattern) => (
                  <li key={pattern.id}>
                    {pattern.name} — {String(pattern.count)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="stats__tile">
      <dt className="stats__label">{label}</dt>
      <dd className="stats__value tabular">{value}</dd>
    </div>
  );
}
