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

For the pre-launch reset/reseed from a clean committed revision, use
`make demo-rebuild`. It quarantines the previous state and rejects a dirty
checkout. See the [reset guide](reset-prelaunch-database.md) before resuming
the deferred demo cutover.
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
count. Raw PNGs and print markup are internal capture inputs.

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

Only the PDF downloads are published. Verify publication:

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

### Default surface-book contract

A request to **“refresh the default surface books”** means: use the normal fixture
with review extras, capture both tiers with the commands above, check the status,
and publish the two PDFs. Reuse the existing generator and profile; no custom
curation script or HTML documentation site is needed.

`make surface-books-fixture` and `make surface-books` default to
`SURFACE_BOOK_MODE=review`:

- Include every available console and entrant page once as a desktop overview,
  including account outcomes, settings tabs, pagination routes and expected refusals.
- Group pages by workflow. Put selected interaction examples immediately after
  their owning page, with numbered steps in actual click order.
- Show major components: workspace selection and side panel, action menus,
  roster details, new-draw dialog, inline score entry, live match selection,
  backup inspection, entry continuation, schedule filters and highlighted bracket
  paths. Include the selected mobile examples beside their related desktop pages.
- Keep the screenshot prominent on the left and action/route/review notes in the
  narrow right column. Normal-motion actions are represented by successive PDF
  frames; PDFs do not contain playable animation.
- Omit duplicate before-action frames, scroll continuations, repeated records and
  exhaustive picker alternatives. Do not recursively discover every control.
- Deliver only `operator-console-surface-book.pdf` and
  `public-entrant-surface-book.pdf`. Screenshots, print markup and manifests are
  internal capture/verification inputs, not a second documentation deliverable.

The accepted 2026-09-09 fixture produced **47 console PDF pages covering 37 route
states**, and **57 entrant PDF pages covering 45 route states**. These are useful
size references, not caps: never drop a new page merely to hold the old count.
Optional pages require their real fixture tokens, identities or saved state;
unavailable prerequisites are reported on the cover and in the manifest.

The ordered labels and selected examples live in
[`tools/surface-book-profile.json`](../../tools/surface-book-profile.json).
When adding a route, add it to the existing capture inventory and place its label
in this profile's workflow order. Unlisted routes still appear at the end, so
forgetting the profile cannot silently remove a page. Add an interaction only
when it explains a distinct major component; reuse an existing recipe in
`tools/surface-interactions.mjs` or `tools/surface-interaction-recipes.mjs`.
Missing selected recipes fail capture rather than silently skipping the example.
Failed actions remain marked incomplete and make capture status partial.

The finishing point is: both manifests complete, every available route represented,
selected examples in order, PDF counts consistent with the manifest, and both
published PDF URLs returning 200. Check a workspace-panel example and a highlighted
path visually. Stop there; do not add permutations or another publishing system.

For a deliberate diagnostic capture only, opt into
`SURFACE_BOOK_MODE=full make surface-books-fixture`. It restores both viewports,
scroll continuations and exhaustive control exploration and can produce thousands
of pages. It is not the review default. `SURFACE_INTERACTIONS=0`, `CAPTURE_LABEL`
and `CAPTURE_LIMIT` are diagnostic overrides, not a complete default-book refresh.

The recorder blocks server writes, including score submission, deletion and
restore. The pure Meet lineup preview POST remains allowed. Static route sheets
use reduced motion; selected action frames use normal motion.
