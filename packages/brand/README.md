# Brand contract

`brand.json` is the single editable source for customer-facing product,
company, and recommended-host identity. After changing it, run:

```bash
npm run brand:generate
npm run brand:check
```

The generator updates the TypeScript export used by the operator and entrant
surfaces and the Python constants used by the API and email layer. CI rejects
stale generated files.

This contract does not rename compatibility-sensitive identifiers. Python
packages, HTTP headers, telemetry instruments, browser-storage keys, database
values, Compose project names, and recovery formats retain their existing
`shuttleworks` namespace.
