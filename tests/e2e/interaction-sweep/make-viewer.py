"""Demote a seeded workspace's member row to `viewer`.

FIXTURE CODE — never imported by the product.

Why this exists: there is no HTTP path to a viewer role. `POST /tournaments`
always writes the creator as `owner` (api/tournaments.py: `add_member(..., role="owner")`)
and no endpoint mutates a member's role. So the one thing the audit's A2 finding
most needs a test for — that a read-only caller cannot mutate — had no way to be
set up, and the smoke suite's viewer test skipped permanently. It writes the row
the API won't.

Run it AFTER the workspace is fully seeded (seed-smoke.mjs does the seeding as an
owner), and before the browser ever loads the page.

The UPDATE must MATCH SOMETHING. SQLAlchemy's `Uuid` column stores a 32-char
undashed hex on SQLite, but that has bitten this repo before, so we try both
forms and hard-fail when neither hits: a silent no-op would leave the suite
quietly asserting a read-only UI against an *owner* — a green test that proves
nothing, which is strictly worse than the skip it replaced.

Usage: python make-viewer.py <path/to.db> <tournament-uuid>
"""

import sqlite3
import sys
import uuid


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    db_path, raw_tid = sys.argv[1], sys.argv[2]
    tid = uuid.UUID(raw_tid)

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "UPDATE tournament_members SET role = 'viewer' WHERE tournament_id IN (?, ?)",
            (tid.hex, str(tid)),  # undashed (SQLite) and dashed, whichever stored
        )
        if cur.rowcount < 1:
            raise SystemExit(
                f"no tournament_members row for {tid} in {db_path} — "
                "the viewer fixture would be a no-op and the suite would assert "
                "a read-only UI against an owner"
            )
        conn.commit()
    finally:
        conn.close()

    print(f"demoted {cur.rowcount} member row(s) of {tid} to viewer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
