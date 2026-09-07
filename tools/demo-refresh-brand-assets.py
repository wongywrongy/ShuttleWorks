"""Replace unreachable ``example.test`` brand images on an existing demo database.

The long-lived Tailscale demo was seeded before `operator-visual-fixes.md`
package P0 changed the seed's branding fields from
``https://example.test/<slug>/logo.svg`` links to inline ``data:`` SVGs. The
app's own ``img-src 'self' data: blob:`` CSP blocks the old links, so every
seeded workspace still logs a console error and renders a broken image.

Re-seeding would fix it and destroy the demo's curated state (the Yunavero
Club Open, the entrant accounts, the live Korea Masters). So this tool edits
the *existing* rows in place, through the product's own routes:

* ``GET/PATCH /tournaments/{id}/setup/public-info`` — the Setup logo/banner.
  The PATCH replaces the section wholesale, so the tool re-sends the section
  exactly as stored with only the two image fields changed. ``visibility``
  and ``regulationsText`` are deliberately dropped: they are projected into
  the GET from the entry-page row and are rejected / re-written on the way
  back in. The entry page (a whole-state PUT) is never touched.
* ``GET/PUT /tournaments/{id}/board-settings`` — the venue board's logo and
  banner, when a workspace has stored one.

Only values whose host is ``example.test`` are replaced, and only image
fields — ``regulationsUrl`` is a link, not an ``<img>`` source, and is left
alone. Everything else in the document is preserved byte for byte, so the
tool is idempotent: a second run reports nothing to do.

Usage:

    tools/demo-refresh-brand-assets.py --base-url http://<demo-ip>:8092
    # ...review the printed plan, then repeat with:
    #   --confirm

    # or restrict to named workspaces (repeatable, ids only):
    tools/demo-refresh-brand-assets.py --base-url ... --workspace <uuid>

Take a backup first (``make demo-backup``).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "simulator"))

from tournament_sim.seed import (  # noqa: E402 - path shim above
    _DEMO_BANNER_DATA_URI,
    _DEMO_LOGO_DATA_URI,
)

BROKEN_HOST = "example.test"
REPLACEMENTS = {"logoUrl": _DEMO_LOGO_DATA_URI, "bannerUrl": _DEMO_BANNER_DATA_URI}

# Read-time projections on the Setup public-info section. They are owned by
# the entry-page row, not by the setup blob, and must not be echoed back.
PROJECTED_PUBLIC_INFO_FIELDS = ("visibility", "regulationsText")


def _request(
    method: str, url: str, body: dict | None = None, headers: dict[str, str] | None = None
) -> tuple[int, str, dict[str, str]]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("X-ShuttleWorks-CSRF", "1")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310 - operator-supplied base URL
            return response.status, response.read().decode("utf-8", "replace"), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace"), dict(error.headers)


def _is_broken(value: object) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        return (urllib.parse.urlparse(value).hostname or "") == BROKEN_HOST
    except ValueError:
        return False


def _workspace_ids(base_url: str, requested: list[str] | None) -> list[tuple[str, str]]:
    status, body, _ = _request("GET", f"{base_url}/tournaments")
    if status != 200:
        print(f"GET /tournaments -> HTTP {status}: {body[:300]}", file=sys.stderr)
        return []
    rows = {row["id"]: row.get("name") or "" for row in json.loads(body)}
    if requested is None:
        return sorted(rows.items(), key=lambda item: item[1])
    out = []
    for workspace_id in requested:
        if workspace_id not in rows:
            print(f"  {workspace_id}: not visible to this caller; skipped")
            continue
        out.append((workspace_id, rows[workspace_id]))
    return out


def _plan_setup(base_url: str, workspace_id: str) -> tuple[dict | None, str | None, list[str]]:
    """Return (patch body, If-Match value, changed field names)."""
    status, body, headers = _request("GET", f"{base_url}/tournaments/{workspace_id}/setup")
    if status != 200:
        print(f"    setup: HTTP {status} {body[:200]}")
        return None, None, []
    document = json.loads(body)
    section = next((s for s in document.get("sections", []) if s.get("key") == "public-info"), None)
    if section is None:
        return None, None, []
    data = dict(section.get("data") or {})
    for field in PROJECTED_PUBLIC_INFO_FIELDS:
        data.pop(field, None)
    changed = [field for field, value in REPLACEMENTS.items() if _is_broken(data.get(field))]
    if not changed:
        return None, None, []
    for field in changed:
        data[field] = REPLACEMENTS[field]
    return {"data": data}, headers.get("ETag") or headers.get("etag"), changed


def _plan_board(base_url: str, workspace_id: str) -> tuple[dict | None, list[str]]:
    status, body, _ = _request("GET", f"{base_url}/tournaments/{workspace_id}/board-settings")
    if status != 200:
        print(f"    board-settings: HTTP {status} {body[:200]}")
        return None, []
    settings = json.loads(body)
    changed = [field for field, value in REPLACEMENTS.items() if _is_broken(settings.get(field))]
    if not changed:
        return None, []
    for field in changed:
        settings[field] = REPLACEMENTS[field]
    return settings, changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="API base URL, e.g. http://100.68.168.126:8092")
    parser.add_argument(
        "--workspace",
        dest="workspaces",
        action="append",
        metavar="UUID",
        help="Restrict to this workspace id. Repeatable. Default: every workspace holding an example.test image.",
    )
    parser.add_argument("--confirm", action="store_true", help="Actually write. Without it this is a dry run.")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    for workspace_id in args.workspaces or []:
        try:
            uuid.UUID(workspace_id)
        except ValueError:
            print(f"not a workspace id: {workspace_id!r}", file=sys.stderr)
            return 2

    targets = _workspace_ids(base_url, args.workspaces)
    print(f"{'Writing to' if args.confirm else 'Dry run against'} {base_url}: {len(targets)} workspace(s) inspected\n")

    touched = failures = 0
    for workspace_id, name in targets:
        setup_body, etag, setup_changed = _plan_setup(base_url, workspace_id)
        board_body, board_changed = _plan_board(base_url, workspace_id)
        if not setup_changed and not board_changed:
            continue
        touched += 1
        print(f"  {workspace_id}  {name!r}")
        if setup_changed:
            print(f"    setup/public-info: {', '.join(setup_changed)} -> inline data: SVG")
        if board_changed:
            print(f"    board-settings:    {', '.join(board_changed)} -> inline data: SVG")
        if not args.confirm:
            continue
        if setup_body is not None:
            status, body, _ = _request(
                "PATCH",
                f"{base_url}/tournaments/{workspace_id}/setup/public-info",
                setup_body,
                {"If-Match": etag} if etag else None,
            )
            ok = status == 200
            print(f"    PATCH setup/public-info -> HTTP {status}{'' if ok else ' ' + body[:300]}")
            failures += 0 if ok else 1
        if board_body is not None:
            status, body, _ = _request(
                "PUT", f"{base_url}/tournaments/{workspace_id}/board-settings", board_body
            )
            ok = status == 200
            print(f"    PUT board-settings -> HTTP {status}{'' if ok else ' ' + body[:300]}")
            failures += 0 if ok else 1

    if not touched:
        print("  Nothing to do — no example.test image remains.")
    elif not args.confirm:
        print(f"\nNothing written. Re-run with --confirm once the {touched} workspace(s) above are correct.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
