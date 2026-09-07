# ShuttleWorks shared UI contract

This is the current contract for the console and entrant applications. It replaces
retired Signal Orange/brutalist rules and conflicting prototype guidance. Tokens
in `tokens.css`, utilities in `tailwind-preset.js`, and shared components implement
this contract. `DESIGN_COLOR.md` documents the semantic color architecture.

## Surfaces and color

Use neutral page and raised surfaces in both themes. Azure identifies actions,
links, focus, and selection; identifiers and ordinary counts use neutral ink.
State always has readable text or an equivalent accessible cue. Reserve status
color for meaningful operational states and exceptions, never decorative emphasis.

Use semantic tokens, not raw colors or stock Tailwind palettes. Text must clear
4.5:1 against its actual surface; essential controls and focus indicators clear
3:1. Check selected, hover, disabled, error, and overlay states in both themes.
Do not reduce essential supporting text with opacity.

Normal cards and buttons have no shadows or press translation. Use separators or
one surface change to group content; do not nest decorative frames. Overlay
surfaces may use the shared elevation tokens. Dense boards are seamed surfaces;
Setup forms have room for labels and guidance. Keep Display dark and readable at
venue distance. Do not add texture, photography, glass, or decorative glow.

## Type and density

Geist is the interface typeface. Use tabular figures for scores, counts, times,
and references without changing the font family. Monospace is for actual code or
technical diagnostics. The public display face is reserved for public titles.
Preserve participant display names, order, and diacritics; never infer surnames.

| Role | Size / line height |
| --- | --- |
| `text-support` | 12 / 16 |
| `text-console` | 14 / 20 |
| `text-public` | 16 / 24 |
| `text-section` | 20 / 28 |
| `text-page` | 28 / 36 |

Body weight is 400, emphasis 600. Existing compact data roles remain available
where useful; essential prose does not belong in micro-label type. Use sentence
case for guidance and actions. Do not apply all-caps styling to names or prose.

Console forms use 36px controls, public forms 40px controls, and public primary
actions 44px. Compact console controls may use 32px with adequate separation.
Actual hit areas must not overlap; pseudo-element hit areas are not a substitute
for measured targets. Match rows start at 48px and grow for doubles and wrapping.

## Layout and components

Console `PageBody` owns page gutters: 24px and a 52rem maximum for forms; data
surfaces use available width. Public mobile layouts use 16px gutters. Use the
4/8/12/16/24/32/48 spacing ladder, 8px label gaps, 16px field gaps, and 24px section
gaps. Account forms cap at 26rem. Brackets scroll within a labeled region rather
than widening the document. Never clip names or essential content to satisfy a
fixed row height.

Reuse the existing settings sections, labeled fields, and aligned rows for Setup,
Publish, and administrative property editors. Avoid duplicate headings and added
indents. Use 6px controls, 8px panels, and 12px overlays; smaller marks can use 4px.

Shared components contain domain-neutral UI only. Apps own tournament semantics,
API access, permissions, and navigation. Meet and Bracket share presentation
archetypes while retaining their domain behavior. Preserve the existing framework,
imports, and semantic token aliases when upgrading components.

## Interaction and truthful state

Every form needs visible labels and distinct dirty, saving, saved, and failed
states. Keep actions where their scope is clear. Explicit publication saves alone
change audience/content visibility; ordinary Setup saves do not publish.

Use semantic headings, native controls, keyboard access, visible focus, associated
errors, and concise live announcements. Modal overlays contain focus, offer a
visible cancel/close, and restore focus to the trigger. Honor reduced motion.
Use restrained color transitions; do not move controls on press.

Display state using the authority that can establish it. Distinguish missing,
loading, failed, denied, stale, and empty states. A local edit is not necessarily
saved, a queued command is not confirmed, and a pending receipt is not success.
Expose backend details only when they help the user decide or recover.

## Verification

Run `npm run test:contrast` and `npm run test:classes` for shared style changes,
then affected consumer tests and builds. Verify actual computed colors, focus,
layout, and overlays in browsers. Public surfaces also require narrow-width and
200% text-zoom checks; console coverage is desktop. Update visual evidence and
record justified domain-specific exceptions rather than adding competing rules.
