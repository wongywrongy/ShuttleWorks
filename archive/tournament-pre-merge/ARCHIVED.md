# Archived — do not edit

This directory is a frozen snapshot of `products/tournament/` as it existed
just before the backend-merge arc retired it in PR 4. The bracket logic,
schema, routes, and React UI all live in the scheduler product now:

| Original location | Lives now at |
|---|---|
| `products/tournament/tournament/` (Python package) | `products/scheduler/backend/services/bracket/` |
| `products/tournament/backend/main.py` (FastAPI routes) | `products/scheduler/backend/api/brackets.py` (authed) |
| `products/tournament/backend/state.py` (in-memory container) | `products/scheduler/backend/repositories/local.py` (`_LocalBracketRepo`) |
| `products/tournament/backend/schemas.py` (Pydantic) | `products/scheduler/backend/api/brackets.py` (inline) |
| `products/tournament/frontend/src/components/*` (React) | `products/scheduler/frontend/src/features/bracket/*` |
| `products/tournament/frontend/src/api.ts` | `products/scheduler/frontend/src/api/{client.ts,bracketClient.tsx,bracketDto.ts}` |
| `products/tournament/frontend/src/hooks/useTournament.ts` | `products/scheduler/frontend/src/hooks/useBracket.ts` |

The arc commits, in order:

1. `dd2b154` — T-A schema + `_LocalBracketRepo` (PR 1).
2. `33405b5` — bracket package moved to scheduler/services/ (PR 2 prep).
3. `b93c794` — T-B + T-C + T-D authed bracket routes + outbox + realtime (PR 2).
4. `a931122` — T-E frontend merge + dashboard dialog collapse (PR 3).
5. The arc-final commit — this archive + docs sweep + Makefile cleanup (PR 4).

## Why we kept the files instead of deleting

Git history covers the *what* and *when* of every change, but git-blame on
a path that no longer exists is friction (`git log -- products/tournament/`
works, but only if you remember the old path). This archive gives one-click
blame access for anyone reading the bracket code later who wants to see
where the original implementation came from.

A follow-up cleanup PR can delete this directory wholesale once the
contents stop being a useful reference (probably a few months out).

## Don't modify anything here

Treat this as immutable. Any bracket-related work should happen against
the live code at `products/scheduler/`. If you're tempted to edit a file
here because of a bug, the bug is almost certainly in the live code —
fix it there.
