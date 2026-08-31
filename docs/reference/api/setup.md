# Setup API

The Setup facade serves the workflow-first checklist and its eight section
editors. It is control-plane projection code, not a second tournament model.

| Method · Path | Purpose |
| --- | --- |
| `GET /tournaments/{id}/setup` | Return overall readiness and the eight derived section states |
| `PATCH /tournaments/{id}/setup/{section}` | Update one Setup-owned section and return the complete re-derived response |

`section` is one of `general`, `dates`, `venue`, `events`, `rules`, `entries`,
`people`, or `public-info`. Each response section includes its status, summary,
operator-facing issues, data, and `authority` (`setup` or `domain`).

## Authority and derivation

No per-section readiness status is stored. The response combines existing
workspace-document values with authoritative domain records:

- Bracket event rows or Meet divisions own Events once they exist.
- Meet or bracket schedule assignments own Venue once they exist.
- A domain-owned section is read-only in Setup. A PATCH returns `409
  SETUP_SECTION_DOMAIN_OWNED` and names the Competition or Operations
  destination that owns the change.

Validators emit operator sentences with a consequence, never internal field
names. For example, “No events defined — draws and registration can't open” is
a blocking issue; `Field: events` is not part of the contract.

The complete rationale is [ADR 0017](/explanation/decisions/0017-domain-derived-setup-readiness).
