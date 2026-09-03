# Repository housekeeping

Status: **pending remote branch deletion access**

The repository is at a clean product handoff after PR #35. `main` is the sole intended development baseline. PR #35 was squash-merged at `9fa6e4fb2d4ab2e10164576db004e5b9035f94bd`; all currently listed non-`main` branches are completed or superseded historical work, and there are no open pull requests using them.

## Pending remote branch cleanup

Delete these stale branches when branch-deletion access is available:

- `claude/mahjong-beginner-onboarding-0evcfo` — PR #31 merged
- `claude/mahjong-contextual-learning-5gtz6g` — PR #23 merged
- `claude/mahjong-mobile-interaction-urpf0p` — PR #19 merged
- `claude/mahjong-onboarding-redesign-5uiw8f` — PR #35 merged
- `claude/mahjong-pages-deployment-bl7trb` — PR #27 merged
- `claude/mahjong-persistence-pwa-x81xcq` — PRs #24 and #25 merged
- `claude/mahjong-responsive-mobile-sg1xnd` — PR #32 merged
- `claude/mahjong-v1-build-tz21j4` — PR #17 merged
- `claude/mahjong-v1-mobile-ui-rl9t6c` — PR #22 merged
- `claude/simplified-beginner-mode-wj42s6` — PR #28 merged
- `feat/engine-core` — PR #16 superseded by merged PR #13
- `feat/hkos-rules-contract` — PR #12 merged
- `fix/pwa-check-mode-choice` — PR #29 merged
- `issue-3-deterministic-engine` — PR #13 merged
- `issue-4-hkos-scoring` — PR #14 merged
- `issue-5-correctness-harness-pre4` — PR #15 superseded by merged PR #17
- `issue-6-heuristic-bots` — PR #18 merged
- `issue-7-device-verdict` — PR #20 merged
- `issue-33-onboarding-research-design` — PR #34 merged

Their history is preserved through commits and pull requests. None should be resumed for new development.

## Intended branch state

Retain only `main` until genuinely new work starts. New work starts from current `main`; never resume a completed agent branch.

Branch deletion is not exposed by the current repository automation surface. Re-list branches and confirm no open PR uses a branch immediately before deleting it manually.

This note can be removed after remote branch cleanup is completed and verified.
