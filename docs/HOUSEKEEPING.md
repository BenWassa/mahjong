# Repository housekeeping

Status: **pending branch deletion access**

The repository is otherwise at a clean handoff point after Issue #7. `main` is the sole intended active development baseline and there are currently no open pull requests.

## Pending remote branch cleanup

Delete the following stale remote branches when direct branch-deletion access is available:

- `claude/mahjong-mobile-interaction-urpf0p`
- `claude/mahjong-v1-build-tz21j4`
- `feat/engine-core`
- `feat/hkos-rules-contract`
- `issue-3-deterministic-engine`
- `issue-4-hkos-scoring`
- `issue-5-correctness-harness-pre4`
- `issue-6-heuristic-bots`
- `issue-7-device-verdict`

These branches contain merged or superseded work and are not active development branches. Their commits remain preserved in repository history through merged work where applicable.

## Intended branch state

After cleanup, retain:

- `main`
- any new branch corresponding to genuinely active work (beginning with Issue #8)

Do not retain completed agent/spike/issue branches merely as historical markers; Git history and merged pull requests are the historical record.

## Recheck before deletion

Before executing the deletion later:

1. fetch/re-list remote branches;
2. confirm there are no open PRs using any listed branch;
3. confirm no branch has become active since this note was written;
4. delete only branches still confirmed merged or superseded;
5. verify the resulting remote branch inventory.

This note can be removed once the pending branch cleanup has been completed and verified.
