# 0017 — Derive Setup readiness from domain state

**Status:** Accepted — 2026-08-30

## Context

The workflow-first console introduced a Setup checklist with eight named
sections. Its first implementation kept a parallel Setup document and treated
that document as readiness truth. Competition and Operations write different
domain records, so a completed bracket workspace with five draws and 155
results could still report “Events and eligibility: Not started” and block the
whole checklist. The empty editor also suggested that an operator could define
a second, conflicting event list after draws existed.

## Decision

Readiness is computed on every `GET /tournaments/{id}/setup` response. Each
section is a named predicate over the same persisted domain state that owns the
work:

- Setup-authored values remain in the existing workspace document; no readiness
  status is stored.
- Existing bracket events and Meet divisions satisfy Events directly.
- Existing schedule assignments satisfy Venue directly.
- When a section has domain objects, its authority is `domain`: Setup renders a
  read-only summary and links to the owning Competition or Operations surface.
  `PATCH` rejects an attempted parallel edit with
  `SETUP_SECTION_DOMAIN_OWNED`.

This records rulings R-M **A** and R-N **A**. It follows the existing
`build_signals` model: compute operational claims from authoritative rows; do
not ask an operator to reconcile duplicate bookkeeping.

## Consequences

- Existing workspaces become honest without a backfill or manual Setup edits.
- No table or solver change is required.
- A completed five-draw, 155-result fixture pins the behavior, including a
  negative control that fails when domain-event projection is removed.
- Setup cannot edit events or venue structure once downstream data owns them;
  the owner surface must provide any future mutation workflow.
- The Setup landing owns the complete checklist. Section pages show only their
  status and overall status, plus the shared downstream-impact note.
