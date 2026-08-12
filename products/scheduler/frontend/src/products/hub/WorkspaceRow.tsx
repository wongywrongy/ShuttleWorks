/**
 * A single workspace row in the Hub's dense list — the handoff prototype's
 * "Hub — workspace dashboard" table grammar: the workspace NAME leads (health
 * dot secondary), then modules, a tabular DATE as trailing metadata, and one
 * plain-language NEXT ACTION as the row's call to action. Nothing else rides
 * the row —
 * the old stacked calendar block, per-row module chips and per-row action
 * buttons were extraneous chrome (2026-07-02 redesign); modules/metrics/
 * buttons live in the inspector. Destructive actions stay in an overflow
 * menu that reveals on hover/focus — never inline on the row surface.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import {
  HealthDot,
  OverflowMenu,
  COL_PRIORITY_CLASS,
  COL_PRIORITY_CLASS_FLEX,
  type OverflowItem,
} from '../../components/control-plane';
import { workspaceHealth } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, type HubGroupId } from './hubGrouping';
import { moduleGlyphs, type ModuleGlyphId } from './moduleGlyphs';

/* Color budget (2026-07): module identity is carried by the LETTER, not a
 * hue — the M/D/B rainbow was decoration. Enabled modules read as neutral
 * filled chips, available ones as dashed outlines.
 *
 * SP-UI-1: the fill was `bg-surface-chip text-text-secondary`, which sat so
 * close to the row background that M/B/D was unreadable without hovering for
 * the title — on a scanning surface that is a dead column. Raised to the
 * raised-surface step + full-strength text, on a hairline so the chip has an
 * edge of its own. Still achromatic, still compact. */
const GLYPH_CLASS: Record<ModuleGlyphId, string> = {
  meet: 'bg-surface-raised text-foreground border border-border',
  display: 'bg-surface-raised text-foreground border border-border',
  bracket: 'bg-surface-raised text-foreground border border-border',
  entries: 'bg-surface-raised text-foreground border border-border',
};

/** Glyph → module name for the chip's title. Was a letter-keyed ternary whose
 *  final `: 'Bracket'` would have called the new E chip "Bracket"; keyed on the
 *  id, a missing module is now a type error instead of wrong hover text. */
const GLYPH_TITLE: Record<ModuleGlyphId, string> = {
  meet: 'Meet',
  display: 'Display',
  bracket: 'Bracket',
  entries: 'Entries',
};

/** The row's Modules column — enabled modules as solid tinted glyphs, or a
 *  single dashed kind-default when nothing is enabled (see moduleGlyphs).
 *
 *  Each glyph is `role="img"` with the module's name as its label. A `title`
 *  alone decodes M/B/D/E for a mouse and for nobody else: it is not focusable,
 *  a screen reader gets a bare letter, and a touch device has no hover. The
 *  label makes the letter a NAMED image everywhere; the title stays for the
 *  pointer tooltip. */
function ModulesCell({ tournament }: { tournament: TournamentSummaryDTO }) {
  const glyphs = moduleGlyphs(tournament.modules ?? [], tournament.kind);
  return (
    <span
      data-testid="row-modules"
      // T4 (390px, 2026-08-12): the row's own `@container/table` (below) lets
      // this yield BEFORE the name does — same `hidden …:flex` mechanism as
      // BandedTable's column priorities, just applied to a hand-rolled cell
      // instead of a `columns` config. Priority 3 (yields soonest): this is
      // decoration the inspector panel already repeats, never the row's only
      // identifying fact.
      className={['w-[108px] shrink-0 items-center gap-1', COL_PRIORITY_CLASS_FLEX[3]].join(' ')}
    >
      {glyphs.map((g) => (
        <span
          key={g.id}
          data-testid={`row-module-${g.id}`}
          role="img"
          aria-label={`${GLYPH_TITLE[g.id]}: ${g.enabled ? 'enabled' : 'available'}`}
          title={`${GLYPH_TITLE[g.id]}: ${g.enabled ? 'enabled' : 'available'}`}
          className={[
            'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold',
            g.enabled
              ? GLYPH_CLASS[g.id]
              : 'border border-dashed border-border text-muted-foreground',
          ].join(' ')}
        >
          {g.letter}
        </span>
      ))}
    </span>
  );
}

/** Tabular date cell — "Jul 12" (year only when it isn't this year). Trailing
 *  METADATA since SP-UI-1: it used to lead the row, which anchored a dense
 *  list on its most often-empty field. Right-aligned so the numerals form a
 *  clean rail.
 *
 *  An undated row renders an EMPTY cell, not an em-dash: the column-level
 *  `showDate` hide only fires when NO visible row has a date, so on a mixed
 *  list the placeholder produced a rail of dashes — visual noise standing in
 *  for the absence of a fact nobody asked for. The width is kept so the dated
 *  rows still align. */
function DateCell({ iso }: { iso: string | null }) {
  // Priority 2: yields after Modules but before the name, same `@container/
  // table` on the row (T4, 390px, 2026-08-12).
  if (!iso) {
    return <span aria-hidden className={['w-16 shrink-0', COL_PRIORITY_CLASS[2]].join(' ')} />;
  }
  const d = eventDate(iso);
  const valid = !Number.isNaN(d.getTime());
  const sameYear = valid && d.getFullYear() === new Date().getFullYear();
  const label = valid
    ? d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: '2-digit' }),
      })
    : iso.slice(0, 10);
  return (
    <span
      className={[
        'w-16 shrink-0 text-right text-2xs sw-num text-muted-foreground',
        COL_PRIORITY_CLASS[2],
      ].join(' ')}
    >
      {label}
    </span>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  group: HubGroupId;
  /** False when NO visible row has a date — the whole column is hidden
   *  instead of rendering a rail of muted em-dashes (2026-07 cleanup). */
  showDate?: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSetDate: () => void;
  onSettings: () => void;
  onDelete?: () => void;
}

export function WorkspaceRow({
  tournament,
  group,
  showDate = true,
  selected,
  onSelect,
  onOpen,
  onSetDate,
  onSettings,
  onDelete,
}: RowProps) {
  const health = workspaceHealth(tournament);
  const action = rowActionFor(tournament, group);
  const receded = group === 'past';
  // "Set date" (and any reason-coded setup step) is the attention-y next
  // action — it warms to amber; Open/View results stay quiet.
  const attention = action.kind === 'set-date';

  const overflowItems: OverflowItem[] = [
    { key: 'settings', label: 'Settings', onSelect: onSettings },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, separator: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    // A plain clickable region for selecting the row (populates the inspector).
    // Not a role=button/option: it embeds interactive children (the action
    // text-button + overflow menu), which ARIA forbids inside a widget role.
    <div
      onClick={onSelect}
      className={[
        // `@container/table`: the row is its own sizing context for the
        // Modules/Date priority-hide below — T4 found this row's NAME
        // resolving to 0px at 390 (`min-w-0 flex-1` against fixed-width
        // siblings with nothing yielding). Same mechanism as BandedTable's
        // `@container/table` columns, scoped to one row instead of a table.
        // `flex-wrap`: wrapping the NAME is only half a fix — at 390px the
        // fixed-width siblings (w-40 action + Modules + Date + overflow) left
        // the name column ~63px, so `break-words` broke it MID-WORD
        // ("Invitatio/nal"). The columns now wrap to a second line instead of
        // strangling the name; see the `min-w-[12rem]` floor below.
        'group flex min-h-[40px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm @container/table',
        'transition-colors duration-fast ease-brand',
        receded ? 'opacity-80 hover:opacity-100' : '',
        selected
          ? 'bg-bg-elev shadow-[inset_2px_0_0_hsl(var(--accent))]'
          : 'hover:bg-muted/40',
      ].join(' ')}
    >
      {/* NAME leads — the row's anchor, and the only thing on it at full
          weight. Everything to its right is metadata or an affordance. */}
      <span className="flex min-w-[12rem] flex-1 items-center gap-2.5">
        <HealthDot health={health} />
        {/* The dot is `aria-hidden` (it has a title, which AT ignores on a
            span), so the one state worth interrupting a scan for gets words. */}
        {health === 'attention' ? <span className="sr-only">Needs attention</span> : null}
        {/* Wraps, never ellipsises: the name is the row's only identifying
            fact, and the row's `flex-wrap` + the 12rem floor above give it the
            width to wrap at WORD boundaries — wrapping is necessary, not
            sufficient; the box still has to have room. */}
        <span className="min-w-0 break-words text-sm font-semibold text-foreground">
          {tournament.name || 'Untitled'}
        </span>
      </span>

      <ModulesCell tournament={tournament} />

      {showDate ? <DateCell iso={tournament.tournamentDate} /> : null}

      {/* NEXT ACTION — the point of the control-plane model, so it has to read
          as the row's call to action rather than as another metadata column.
          It was already a real button; SP-UI-1 makes that VISIBLE: a hover
          wash + revealed chevron, and a focus ring that was previously
          invisible even though the control was always keyboard-reachable.
          Same accessible name and click behavior as before. */}
      <button
        type="button"
        data-testid="row-next-action"
        onClick={(e) => {
          e.stopPropagation();
          if (action.kind === 'set-date') onSetDate();
          else onOpen();
        }}
        className={[
          'flex w-40 shrink-0 items-center justify-between gap-1 rounded-sm px-2 py-1 text-left text-xs',
          'transition-colors duration-fast ease-brand',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          attention
            ? 'text-status-warning group-hover:bg-status-warning/10'
            : 'text-muted-foreground group-hover:bg-accent/10 group-hover:text-accent',
        ].join(' ')}
      >
        <span className="min-w-0 break-words">{action.label}</span>
        <span
          aria-hidden
          className="shrink-0 opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100"
        >
          &rsaquo;
        </span>
      </button>

      {/* Quiet at rest, not absent. `opacity-0` + `group-hover` made the only
          route to Settings and Delete a hover — and `:hover` never fires on a
          touch device, so on the tablet the owner runs this menu was
          unreachable at every width. Keyboard always reached it (opacity
          doesn't leave the tab order); touch had nothing. */}
      <span className="opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <OverflowMenu items={overflowItems} />
      </span>
    </div>
  );
}
