# Registration / competition implementation

Implements [ADR 0030](../explanation/decisions/0030-registration-competition.md).
The implementation uses a fresh database cutover without compatibility backfill
or dual write. The owner deferred the shared demo cutover on 2026-09-12 while
the codebase continues changing. Existing workspace changes are preserved.

- [x] Record the decisions and glossary; provide the Mermaid ER diagram.
- [x] Extract invitations, introduce player representatives, and replace payment
  flags with a signed ledger and submission lifecycle.
- [x] Add versioned catalogs, competition events, units, memberships, draw
  revision metadata, and database constraints.
- [x] Implement bind, rebind, withdrawal, audit, and atomic roster projections.
- [x] Switch operator APIs, desk controls, roster writers, public readers, and
  current-version checkpoints to the canonical records.
- [x] Complete backend, console, entrant, simulator, and migration verification.
- [x] Rehearse the complete demo import against an isolated PostgreSQL API.
- [x] Upgrade both empty development databases to the new schema.
- [ ] Deferred by the owner: recreate/reseed the shared demo after the codebase
  settles and the owner explicitly resumes the cutover.

The current schema is frozen into `0001_baseline.py` by the
[pre-launch migration policy](migration-and-versioning-policy.md).
The historical cutover and its intermediate-revision tests are retired;
fresh Alembic installations assert current constraints, indexes, triggers,
and model parity. Downgrades deliberately raise.

Confirmed-unit roster guards run on SQLite and PostgreSQL. Cross-references
between registration and membership use deferred foreign keys, supported by
both databases, so a tournament-wide cascade can finish before those
references are checked. Individual deletion still cannot leave a dangling
membership. This is distinct from PostgreSQL-only deferred constraint triggers.

Bind retries retain membership identities. Rebind checks source/destination
versions and records the move. Draw revisions retain old units; re-pairing a
drawn unit is refused. Imported/generated draws stage complete rosters before
setting draw status. A draw cannot contain a pair with a missing player.

The desk exposes default-target and selected-target binding, event creation,
rebind/re-pair, whole-unit withdrawal, and signed payment/refund amounts.
Payment request identities survive failed requests. Pending doubles units are
shown as seeking a partner.

Historical verification before the 2026-09-12 baseline squash:

- Backend: 2,528 passed, 74 skipped.
- Mermaid ER grammar parsed successfully with Mermaid.
- Seeded SQLite upgrade/downgrade/upgrade and Alembic model parity passed.
- Seeded PostgreSQL 16 upgrade/downgrade/upgrade passed.
- PostgreSQL singles, accepted doubles, retry, roster trigger, ledger, rebind,
  withdrawal, and tournament cascade checks passed.
- Console and entrant production builds passed.
- All 2,391 console tests passed; all 1,249 entrant tests passed across the
  full run and the rerun of sandbox-blocked dependency checks.
- All 78 simulator tests passed, including the ephemeral HTTP smoke test.
- Bundled demo fixture preview passed.
- Full API rehearsal: 30 workspaces and 4,602 matches imported successfully,
  followed by the synthetic outcome and bye fixtures.
- Both empty development SQLite databases upgraded to the new head and passed
  `foreign_key_check`.

The demo seed now creates competition defaults for registration events. Its
generator reserves all supplied players before inventing opponents, preventing
a finalist from appearing in another pair in the same event. Seed format 4
and generator version 6 record this change; the full fixture checks uniqueness
across all 150 events.

The shared demo remains on its original schema and data. Its reset, deployment,
and reseeding are deferred by the owner while code changes continue; this is
not a pending approval request. No reset command ran.

When the owner resumes this work, rerun regression and migration checks against
the then-current code and repeat the isolated import rehearsal. Rebuild images
from that verified code; the images built during this implementation are not a
future release guarantee. The deferred cutover sequence is:

```sh
DEMO_RESET_CONFIRM=reset-demo bash tools/demo-compose.sh reset
bash tools/demo-compose.sh up
make demo-seed-apply
make demo-seed-apply-outcomes
make demo-seed-apply-bye
```

The reset script verifies a backup before stopping services and quarantines the
old database and data directories. Finish by checking readiness, schema head,
confirmed roster counts, participant unit links, and public demo pages.

Draw slots, match-side foreign keys, representative-sharing UI, and draft
resume/autosave remain outside this cycle.
