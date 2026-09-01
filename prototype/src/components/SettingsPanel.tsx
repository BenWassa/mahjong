import { useState } from "react";
import { medianMillis, type Metrics } from "../model/interaction.ts";
import type {
  ControlPlacement,
  HandMetrics,
  LabelMode,
  PrototypeSettings,
  TileSizeMode,
} from "../model/settings.ts";
import type { InteractionModel } from "../model/interaction.ts";

export interface SettingsPanelProps {
  readonly settings: PrototypeSettings;
  readonly metrics: Metrics;
  readonly handMetrics: HandMetrics | null;
  readonly log: readonly string[];
  readonly onChange: (next: PrototypeSettings) => void;
  readonly onResetMetrics: () => void;
  readonly onClose: () => void;
}

export function SettingsPanel({
  settings,
  metrics,
  handMetrics,
  log,
  onChange,
  onResetMetrics,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The phone reaches this over plain http on the local network, which is not a
  // secure context, so `navigator.clipboard` is usually absent. The report is
  // therefore always rendered as selectable text and the clipboard is only a
  // shortcut when it happens to exist.
  const showReport = () => {
    const text = buildReport(settings, metrics, handMetrics);
    setReport(text);
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) return;
    void clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  };

  return (
    <div className="panel" role="dialog" aria-label="Prototype settings">
      <div className="panel__head">
        <h1>Interaction prototype — #7</h1>
        <button type="button" className="chip" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>

      <div className="panel__body">
        <section>
          <h2>Hand</h2>
          <Choice<TileSizeMode>
            label="Tile size"
            value={settings.tileSize}
            options={[
              ["fit", "fit"],
              ["s", "42px"],
              ["m", "52px"],
              ["l", "62px"],
            ]}
            onSelect={(tileSize) => {
              onChange({ ...settings, tileSize });
            }}
          />
          <Choice<number>
            label="Gap"
            value={settings.tileGap}
            options={[
              [0, "0"],
              [2, "2"],
              [3, "3"],
              [6, "6"],
              [10, "10"],
            ]}
            onSelect={(tileGap) => {
              onChange({ ...settings, tileGap });
            }}
          />
          <Choice<LabelMode>
            label="Corner labels"
            value={settings.labels}
            options={[
              ["off", "off"],
              ["rank", "rank"],
              ["rank-suit", "rank+suit"],
            ]}
            onSelect={(labels) => {
              onChange({ ...settings, labels });
            }}
          />
        </section>

        <section>
          <h2>Controls</h2>
          <Choice<ControlPlacement>
            label="Claim placement"
            value={settings.placement}
            options={[
              ["rail", "right rail"],
              ["band", "band above hand"],
            ]}
            onSelect={(placement) => {
              onChange({ ...settings, placement });
            }}
          />
          <Choice<InteractionModel>
            label="Discard model"
            value={settings.model}
            options={[
              ["tap-tap", "tap · tap (baseline)"],
              ["flick", "flick up (comparison)"],
            ]}
            onSelect={(model) => {
              onChange({ ...settings, model });
            }}
          />
          <Choice<boolean>
            label="Outline decision tiles"
            value={settings.showDecisionTiles}
            options={[
              [false, "off"],
              [true, "on"],
            ]}
            onSelect={(showDecisionTiles) => {
              onChange({ ...settings, showDecisionTiles });
            }}
          />
        </section>

        <section>
          <h2>Session</h2>
          <dl className="stats">
            <Stat label="Discards" value={String(metrics.discards)} />
            <Stat label="Reported misfires" value={String(metrics.misfires)} bad={metrics.misfires > 0} />
            <Stat label="Selection moves" value={String(metrics.selectionMoves)} />
            <Stat label="Taps on an inert hand" value={String(metrics.inertTaps)} />
            <Stat label="Claims / passes" value={`${String(metrics.claims)} / ${String(metrics.passes)}`} />
            <Stat label="Median time to discard" value={formatMillis(medianMillis(metrics.discardMillis))} />
          </dl>
          <div className="panel__buttons">
            <button type="button" className="chip" onClick={onResetMetrics}>
              reset counts
            </button>
            <button type="button" className="chip" onClick={showReport}>
              {copied ? "copied ✓" : "report"}
            </button>
          </div>
          {report !== null && (
            <textarea className="report" readOnly rows={7} value={report} aria-label="Session report" />
          )}
        </section>

        <section>
          <h2>Recent</h2>
          <ul className="log">
            {log.length === 0 ? <li className="log__empty">nothing yet</li> : null}
            {log.map((line, index) => (
              <li key={`${String(index)}-${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={bad ? "is-bad" : undefined}>{value}</dd>
    </>
  );
}

function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onSelect: (value: T) => void;
}): React.JSX.Element {
  return (
    <div className="choice">
      <span className="choice__label">{label}</span>
      <span className="choice__options">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={String(optionValue)}
            type="button"
            className={`chip${optionValue === value ? " is-on" : ""}`}
            onClick={() => {
              onSelect(optionValue);
            }}
          >
            {optionLabel}
          </button>
        ))}
      </span>
    </div>
  );
}

function formatMillis(value: number | null): string {
  return value === null ? "—" : `${String(value)} ms`;
}

/** Plain-text session summary the tester can paste back into the issue. */
export function buildReport(
  settings: PrototypeSettings,
  metrics: Metrics,
  handMetrics: HandMetrics | null,
): string {
  const lines = [
    "mahjong #7 interaction prototype — device session",
    `viewport: ${String(window.innerWidth)}x${String(window.innerHeight)} css px, dpr ${String(window.devicePixelRatio)}`,
    `settings: size=${settings.tileSize} gap=${String(settings.tileGap)} labels=${settings.labels} controls=${settings.placement} model=${settings.model}`,
    handMetrics === null
      ? "hand: not measured"
      : `hand: tile ${String(handMetrics.tileWidth)}x${String(handMetrics.tileHeight)}px ≈ ${String(handMetrics.approxMillimetres)}mm wide, overflow=${String(handMetrics.overflows)}`,
    `discards: ${String(metrics.discards)}  misfires: ${String(metrics.misfires)}  selection moves: ${String(metrics.selectionMoves)}`,
    `inert taps: ${String(metrics.inertTaps)}  claims: ${String(metrics.claims)}  passes: ${String(metrics.passes)}`,
    `median time to discard: ${formatMillis(medianMillis(metrics.discardMillis))}`,
  ];
  return lines.join("\n");
}
