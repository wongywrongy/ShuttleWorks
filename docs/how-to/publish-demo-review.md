# Update the private demo and publish surface books

Use this workflow whenever reviewed source changes need to be shared through
Tailscale. Run commands from the repository root on the Linux demo host.
Docker Compose, Tailscale, Node/npm, the repository Python environment, and
Playwright Chromium must be installed. Reviewers must be connected to the tailnet.

## Update the sites

```bash
make demo-update
make demo-status
```

`demo-update` takes and verifies a database backup, builds the current checkout,
and recreates the application containers with readiness checks. It accepts
uncommitted source changes and labels the images with their source identity.
It preserves Postgres, accounts, invitations, and existing workspace data.
A source update does **not** reapply seed changes to existing records.

For a clean, committed release rebuild with fresh base images, use
`make demo-rebuild`. That command deliberately rejects a dirty checkout.
Use `make demo-up` for initial startup. See [running locally](running-locally.md)
for state directories, database recovery, and the production-parity contract.

Print the host address and check both origins:

```bash
demo_ip="$(bash tools/demo-compose.sh ip)"
curl -fI "http://$demo_ip:8090/"
curl -fI "http://$demo_ip:8091/e/"
curl -f "http://$demo_ip:8092/health"
```

| Surface | URL |
| --- | --- |
| Operator console | `http://<tailscale-ip>:8090/` |
| Public entrant site | `http://<tailscale-ip>:8091/e/` |
| API | `http://<tailscale-ip>:8092/` |
| Book downloads | `http://<tailscale-ip>:8093/` |

These ports bind only to the Tailscale address. Operator and public sites use
separate browser origins. This workflow does not enable Tailscale Funnel or
publish the sites to the internet.

## Generate reproducible review books

Use the disposable source fixture when the review needs current seed data.
It supplies the canonical Taipei live / Korea upcoming dataset and optional
real account, receipt, reset, partner, and Meet invitation handles. It does not
replace the durable demo database.

```bash
FIXTURE_MODE=normal FIXTURE_REVIEW_EXTRAS=1 make fixture-up
review_dir="docs/screenshots/ui-review/review-$(date -u +%Y%m%dT%H%M%SZ)"
make surface-books-fixture SURFACE_REPORT_DIR="$review_dir"
make surface-books-status SURFACE_REPORT_DIR="$review_dir"
```

Keep `review_dir` in the same shell for the following commands. If fixture
startup takes longer than the Makefile readiness wait, inspect
`/tmp/shuttleworks-fixture-up.log` and the state file before starting another
instance. Occupied ports are rejected rather than silently capturing another
server. See [the fixture guide](run-the-shared-fixture.md) for port and state-file
overrides and teardown.

The fixture freezes event time at `2026-07-31T05:15:00Z` across API, console,
and entrant tier. Security and audit clocks continue to use real time.
`FIXTURE_MODE=failure` deliberately introduces operational faults and must not
be presented as the normal review dataset.

To capture the **durable deployment's current data** instead, use:

```bash
review_dir="docs/screenshots/ui-review/deployed-$(date -u +%Y%m%dT%H%M%SZ)"
SHUTTLEWORKS_DEMO_NOW=2026-07-31T05:15:00Z \
  make surface-books SURFACE_REPORT_DIR="$review_dir"
```

This target reads workspace IDs from the demo's seed manifest. Optional pages
are omitted unless real handles are supplied. Record the actual deployed image
revision from `make demo-status` as `REVIEWED_BUILD_SHA` when capturing a remote
build; the capture checkout's Git SHA alone does not establish deployed provenance.
Do not label fixture books as screenshots of the durable database.

## Review before publishing

Check both manifests report `complete`, with no failed viewports. Open desktop,
mobile, and every continuation image; HTTP success alone is not visual review.
For long lists, compare adjacent overlapping frames so sticky headers do not
hide an entire row. For brackets, exercise horizontal scrolling and round
navigation in the browser as well as reviewing the static screenshots.

Confirm that names, fees, venue-local deadlines, schedules, results, and Hub
status agree. Use the same dataset across both tiers. Existing durable data
needs a separate, backed-up migration when seed behavior changes; do not use
reset/reseed as a routine deployment step.

The capture inventory excludes compatibility aliases, disabled destinations,
fabricated capabilities, and duplicate pages. Real reachable recovery states
remain. An expected refusal must return its declared status. Manifests record
URLs, viewport results, provenance, omitted states, and the expected PDF page
count; raw PNGs sit beside the HTML/PDF output.

## Publish the reviewed directory

```bash
make surface-books-serve SURFACE_REPORT_DIR="$review_dir"
make surface-books-url SURFACE_REPORT_DIR="$review_dir"
```

The dedicated book container mounts only that directory, read-only, and restarts
with Docker. Repeating the serve command switches it to the newly reviewed
artifact directory. Keep the previous dated directory for rollback.

Share these direct PDF links using the printed Tailscale address:

```text
http://<tailscale-ip>:8093/operator-console-surface-book.pdf
http://<tailscale-ip>:8093/public-entrant-surface-book.pdf
```

The corresponding `.html` links open the books in a browser. Verify publication:

```bash
curl -fI "http://$demo_ip:8093/operator-console-surface-book.pdf"
curl -fI "http://$demo_ip:8093/public-entrant-surface-book.pdf"
bash tools/serve-surface-books.sh status "$review_dir"
```

A successful PDF response has status 200, `Content-Type: application/pdf`, and
a nonzero content length. This is a static artifact server; sharing a book does
not update the application containers.

## Recovery and routine maintenance

- **Application update fails:** inspect `make demo-status` and container logs.
  Rebuild the previous reviewed source; do not automatically reset the database.
- **Wrong books published:** rerun `surface-books-serve` with the previous dated
  directory. No recapture is needed.
- **Stop downloads:** `bash tools/serve-surface-books.sh down "$review_dir"`.
- **Stop the demo:** `make demo-down` backs up before stopping containers.
- **Stop the disposable fixture:** `make fixture-down`, using the same
  `FIXTURE_STATE_FILE` override if one was used at startup.
- **Verify recovery:** `make demo-backup-verify` and `make demo-restore-drill`.
  Live restore and reset have separate explicit confirmation safeguards.

After changing these instructions or their helpers, run `npm run test:docs`,
`npm run docs:paths`, and `npm run docs:build`. Deployment verification additionally
requires live HTTP checks and a browser check of both published origins.

### Interaction evidence in surface books

`make surface-books` also records desktop and mobile interaction sequences for
workspace action menus, live-day match selection, and published bracket player
paths and round selection when those routes are included. Each HTML book embeds
playable WebM clips with controls (no autoplay); the PDF includes before/after
keyframes. The interaction appendix is linked from the surface index.

Static route sheets retain reduced motion. Recordings use normal motion and real
UI controls, including initial loading. Their capture contexts block non-read
HTTP methods so these review recipes cannot submit tournament changes. A failed
control or expected state makes the manifest partial. Companion manifests list
interaction outcomes, final URLs, screenshots, and downloadable video assets.
These are representative interaction samples, not exhaustive journey coverage.
