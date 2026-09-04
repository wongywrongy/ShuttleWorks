# Brand configuration

ShuttleWorks is the product; Yunavero is the company. The editable source of
truth is `packages/brand/brand.json`. It feeds the operator console, public
entrant site, API/email copy, documentation metadata, and visual-review books.

After changing a product name, company name, endorsement, monogram, company
domain, or recommended hostname, regenerate and verify both language adapters:

```bash
npm run brand:generate
npm run brand:check
npm run build:all
npm run test:docs
```

The manifest is bundled into release artifacts. Event-node startup and offline
operation never fetch branding from Yunavero DNS or another network service.

## Stable technical identity

Brand changes are not protocol migrations. Do not rename the `shuttleworks`
Python package, HTTP headers, telemetry instruments, database values,
browser-storage keys, Compose projects, recovery formats, or existing file
names as part of a customer-facing rebrand. Those values are compatibility
contracts and require a separately designed migration if they ever change.

Production origins remain deployment configuration. The manifest records the
recommended Yunavero hostnames, while `APP_HOSTNAME` and `PLAY_HOSTNAME` remain
required Compose inputs so another deployment cannot accidentally inherit a
hard-coded origin.
