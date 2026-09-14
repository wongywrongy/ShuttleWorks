#!/usr/bin/env python3
"""Issue a private one-use activation file for an imported offline operator.

Run locally with the event-node API environment. This is an administrator
provisioning operation, not a remotely callable identity-recovery bypass.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=uuid.UUID, required=True)
    parser.add_argument("--operator", type=uuid.UUID, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New private file, handed only to this operator")
    parser.add_argument("--reset-existing", action="store_true", help="Revoke this person's node password, factor and sessions before enrollment")
    parser.add_argument("--reason", help="Audited recovery reason; verify the person out of band first")
    args = parser.parse_args()
    if args.reset_existing != bool(args.reason):
        parser.error("--reset-existing and --reason must be supplied together")
    created = False
    engine = None
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        from core.config import settings
        from core.time_utils import _utcnow
        from db.session import normalize_database_url
        from identity.node_identity import provision
        from repositories.local import LocalRepository

        if settings.deployment_profile != "event_node":
            raise ValueError("Event-node profile required")
        engine = create_engine(normalize_database_url(settings.database_url))
        with Session(engine, autoflush=False, expire_on_commit=False) as session:
            repo = LocalRepository(session)
            with repo.transaction():
                token, expires_at = provision(repo, user_id=args.operator, tournament_id=args.workspace,
                    node_id=uuid.UUID(settings.node_id), now=_utcnow(), reset_reason=args.reason)
                account = repo.get_user_identity(args.operator)
                fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                created = True
                with os.fdopen(fd, "w") as output:
                    json.dump({"workspaceId": str(args.workspace), "email": account.email,
                               "activationToken": token, "expiresAt": expires_at.isoformat()}, output)
                    output.write("\n")
        print("Activation file issued. Deliver privately to this operator within ten minutes, then remove it.")
        return 0
    except Exception:
        # Database/provider failures may embed connection strings. The failed
        # transaction also invalidates the just-written credential artifact.
        if created:
            args.output.unlink(missing_ok=True)
        print("Refused: verify node configuration, active membership and a new private output path", file=sys.stderr)
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
