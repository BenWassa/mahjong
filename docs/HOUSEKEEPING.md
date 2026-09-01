# Repository housekeeping

Status: **pending branch deletion access**

The repository is at a clean product handoff after PR #22 / V1.7.1. `main` is the sole intended development baseline and completed/superseded branches are historical only.

## Pending remote branch cleanup

Delete these stale branches when branch-deletion access is available:

- `claude/mahjong-mobile-interaction-urpf0p`
- `claude/mahjong-v1-build-tz21j4`
- `claude/mahjong-v1-mobile-ui-rl9t6c`
- `feat/engine-core`
- `feat/hkos-rules-contract`
- `issue-3-deterministic-engine`
- `issue-4-hkos-scoring`
- `issue-5-correctness-harness-pre4`
- `issue-6-heuristic-bots`
- `issue-7-device-verdict`

All contain merged or superseded work. Their history is preserved through commits and pull requests.

## Intended branch state

Retain `main` plus only branches for genuinely active work. New work starts from current `main`; never resume a completed agent branch.

Branch deletion is not exposed by the current repository automation surface. Re-list branches and confirm no open PR uses a branch before deleting it manually.

This note can be removed after remote branch cleanup is completed and verified.
