/**
 * The four TEXT ROLES (operator/public remediation P2).
 *
 * The design system already owns the ink: `--text-primary` / `--text-secondary`
 * / `--text-muted` (tokens.css), surfaced by the Tailwind preset as
 * `text-text-primary` / `text-text-secondary` / `text-muted-foreground`. What
 * did not exist was a rule for WHICH ink a given string gets, so "it sits in a
 * subtitle" and "it is furniture" had collapsed into one muted register and
 * important operational metadata — the match reference, the court, the start
 * time, the round — was reading at the same weight as a field label.
 *
 * The roles, and the test a call site should apply:
 *
 *   TEXT_PRIMARY    the thing itself — names, headings, scores, values.
 *   TEXT_SECONDARY  information a reader ACTS ON that is not the thing itself:
 *                   match reference, court, scheduled/estimated/actual time,
 *                   round, event. Subordinate in size and position, NOT in ink.
 *   TEXT_HELPER     furniture — field labels, hints, counts, units, empty-state
 *                   prose. Nothing here changes a decision.
 *   TEXT_DISABLED   an INOPERABLE CONTROL, and nothing else. A losing side, a
 *                   bye and an unresolved slot are facts, not dead buttons;
 *                   styling them this way is the specific defect P2 fixes.
 *
 * All three inks clear 4.5:1 on every product surface in both themes (measured
 * from tokens.css: muted is 5.28:1 at worst in light, 4.79:1 in dark) — the
 * defect this file addresses is hierarchy, not raw contrast, so the fix is
 * choosing the right role rather than darkening everything.
 */

/** Names, headings, values — the thing the row is about. */
export const TEXT_PRIMARY = 'text-foreground';

/** Actionable supporting metadata: reference, court, time, round, event. */
export const TEXT_SECONDARY = 'text-text-secondary';

/** Furniture: labels, hints, units, counts. */
export const TEXT_HELPER = 'text-muted-foreground';

/** Reserved for controls that cannot be operated. Never for data. */
export const TEXT_DISABLED = 'text-muted-foreground opacity-60';
