"""Delete named-by-ID workspaces from a demo/capture database.

`operator-visual-fixes.md` package P0 requires that test-only rows — the
`Interaction smoke` / `Interaction smoke (viewer)` workspaces an interaction
run left behind on the Tailscale demo, and anything like them — stop appearing
in the normal visual-review dataset, while being explicit that
**user-created production workspaces must not be deleted by name matching**.

So this tool takes **workspace UUIDs and nothing else**. It has no name
pattern, no `--all-drafts`, no heuristic. It prints what each id actually is
(name, kind, status, and the row counts that would go with it) and refuses to
delete anything until the caller passes `--confirm`. Deletion goes through the
product's own `DELETE /tournaments/{id}` route, so tenancy and permission
checks apply exactly as they do for a human operator.

Usage:

    tools/demo-prune-workspaces.py --base-url http://<demo-ip>:8092 \\
        --workspace ddf6b4b1-dae8-49e5-8a36-aea01f594958 \\
        --workspace 9144fecb-30cf-459e-9697-ab93f245de1d

    # ...review the printed summary, then repeat with:
    #   --confirm

Take a backup first (`make demo-backup`). Deletion cascades.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid

CSRF_HEADER = ("X-ShuttleWorks-CSRF", "1")


def _request(method: str, url: str) -> tuple[int, str]:
    request = urllib.request.Request(url, method=method)
    request.add_header(*CSRF_HEADER)
    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310 - operator-supplied base URL
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def _describe(base_url: str, workspace_id: str) -> dict | None:
    status, body = _request("GET", f"{base_url}/tournaments/{workspace_id}")
    if status != 200:
        print(f"  {workspace_id}: HTTP {status} — not visible to this caller; skipped")
        return None
    return json.loads(body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="API base URL, e.g. http://100.68.168.126:8092")
    parser.add_argument(
        "--workspace",
        dest="workspaces",
        action="append",
        required=True,
        metavar="UUID",
        help="A workspace id to delete. Repeatable. Ids only — never a name pattern.",
    )
    parser.add_argument("--confirm", action="store_true", help="Actually delete. Without it this is a dry run.")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    for workspace_id in args.workspaces:
        try:
            uuid.UUID(workspace_id)
        except ValueError:
            print(f"not a workspace id: {workspace_id!r}", file=sys.stderr)
            return 2

    print(f"{'Deleting' if args.confirm else 'Dry run — would delete'} from {base_url}:")
    targets = []
    for workspace_id in args.workspaces:
        summary = _describe(base_url, workspace_id)
        if summary is None:
            continue
        print(
            f"  {workspace_id}  {summary.get('name')!r}"
            f"  kind={summary.get('kind')} status={summary.get('status')}"
            f" dates={summary.get('tournamentDate')}..{summary.get('tournamentEndDate')}"
        )
        targets.append(workspace_id)

    if not args.confirm:
        print("\nNothing deleted. Re-run with --confirm once the list above is correct.")
        return 0

    failures = 0
    for workspace_id in targets:
        status, body = _request("DELETE", f"{base_url}/tournaments/{workspace_id}")
        ok = status in {200, 204}
        print(f"  DELETE {workspace_id} -> HTTP {status}{'' if ok else ' ' + body[:200]}")
        failures += 0 if ok else 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
