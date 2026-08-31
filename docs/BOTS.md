# V1 heuristic bots

The V1 opponents are deterministic, lightweight policies. They are intended to
play a recognisable, sensible HKOS hand without heavyweight search or expert
claims.

## Information boundary

`createHeuristicBot` accepts only `PublicGameState` and the same seat-scoped
legal actions available to a player. Simulation wiring owns the trusted state
only long enough to call `projectPublicState`; no bot controller receives the
wall, another seat's concealed tiles, concealed-kong identities, responder
lists, or the debug game record.

## Policy

- take every legal win;
- calculate exact standard-hand and Thirteen-Orphans shanten;
- prefer discards that reduce shanten, then preserve pairs and nearby suited
  tiles;
- retain suit concentration and scoring winds/dragons as practical faan paths;
- Chow only when the resulting hand is closer to completion;
- Pung or Kong when it advances the hand, or preserves distance while claiming
  a scoring honour;
- declare own-turn kongs while enough wall remains for their replacement;
- late in the hand, prefer kinds already discarded by opponents when completion
  value is otherwise comparable;
- resolve equal evaluations from a supplied, deterministic per-seat seed.

The engine remains the sole authority for legality and scoring. The policy does
not infer or recreate either contract.

## Evaluation

`benchmarkBotAgainstRandom` runs complete seeded East rounds and rotates the
candidate through all four seats on each deal seed. The other three seats use a
public-state random-action controller. This cancels fixed dealer/seat advantage
and reports candidate win share and point differential. The routine test corpus
requires a positive average point result and a candidate share above 60% of
decisive hands; the threshold is deliberately competence-level, not a claim of
expert strength.
