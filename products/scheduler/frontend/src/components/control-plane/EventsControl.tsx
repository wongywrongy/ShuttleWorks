/**
 * EventsControl — categorized collapsible chrome for a player's event
 * entries. CHROME ONLY: what an "entry" means (Meet rank chips, Bracket
 * participant rows) is injected via `renderTypeEditor` — this component
 * has no write path and no semantics of its own.
 *
 * Category grammar: the badminton defaults (Singles → MS, WS · Doubles →
 * MD, WD · Mixed → XD) are the ORDER, not the vocabulary. Disciplines are
 * operator data — a bracket event can be "BS", "MDC", anything — and a
 * FIXED five-code table cannot hold them. Two bugs came out of assuming it
 * could (browser pass, 2026-08-12):
 *
 *   - The header counted "1 entered" while SINGLES / DOUBLES / MIXED all
 *     read "Not entered". The entry's discipline was in none of the five, so
 *     it fell out of every category while still counting in the total.
 *   - Expanding DOUBLES set `aria-expanded=true` over a 10px div with zero
 *     children: no MD/WD draw existed, so the consumer's editor returned
 *     null for both types and the disclosure opened onto nothing.
 *
 * So: pass `types` (the discipline codes the consumer can actually edit) and
 * categories are built from THAT plus whatever the entries carry — a default
 * category appears only if one of its codes is live, and any code outside the
 * five gets a category of its own. A disclosure with nothing behind it is
 * therefore not rendered at all, which is the stronger reading of "a control
 * either opens onto something or does not claim it opens": DOUBLES with no
 * MD/WD draw is now absent rather than an inert caret.
 *
 * Collapsed, each category header summarizes its entered codes as
 * compact `EventBadge`s (or muted-italic "Not entered"); clicking the
 * header expands the category to the consumer-supplied per-type editor
 * rows. All categories start collapsed unless listed in `categoriesOpen`.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { EYEBROW_CLASS } from '../../lib/utils';

export interface EventCategory {
  id: string;
  label: string;
  /** Discipline type codes in this category (e.g. ['MS', 'WS']). */
  types: string[];
}

/** The default discipline categorization — the badminton five, in the
 *  canonical order. A starting point and a sort order, NOT the set of
 *  disciplines a workspace may have. */
export const EVENT_CATEGORIES: EventCategory[] = [
  { id: 'singles', label: 'Singles', types: ['MS', 'WS'] },
  { id: 'doubles', label: 'Doubles', types: ['MD', 'WD'] },
  { id: 'mixed', label: 'Mixed', types: ['XD'] },
];

const DEFAULT_TYPES = new Set(EVENT_CATEGORIES.flatMap((c) => c.types));

/**
 * Categories for one render: each default category narrowed to the codes
 * actually in play, then one own-category per code the defaults don't name.
 *
 * Without `types` (the legacy call shape) the five defaults all render, so a
 * consumer that never learned the prop is unchanged — but an ENTRY whose
 * discipline is outside them still gets its own category either way, because
 * an entry that counts in the header and appears in no row is the reported
 * "1 entered / Not entered" contradiction.
 */
function categoriesFor(
  types: readonly string[] | undefined,
  entryTypes: readonly string[],
): EventCategory[] {
  const live = types ? new Set([...types, ...entryTypes]) : null;
  const defaults = live
    ? EVENT_CATEGORIES.map((c) => ({
        ...c,
        types: c.types.filter((t) => live.has(t)),
      })).filter((c) => c.types.length > 0)
    : EVENT_CATEGORIES;
  const extra = [...new Set(live ?? entryTypes)]
    .filter((t) => t !== '' && !DEFAULT_TYPES.has(t))
    // The code IS the label: there is no long name to look up, and
    // inventing one is how "BS1 - undefined 1" shipped (defect D1).
    .map((t) => ({ id: t, label: t, types: [t] }));
  return [...defaults, ...extra];
}

/** Discipline prefix of an entry code: "MD2" → "MD". */
const prefixOf = (code: string) => code.replace(/\d+$/, '');

/** An entry with explicit discipline attribution, for consumers whose
 *  display codes don't parse to a discipline (e.g. Bracket badges
 *  relabeled by event id — "MD2X" is still a Doubles entry). Plain
 *  string entries fall back to prefix inference. */
export interface EventsEntry {
  code: string;
  type?: string;
}

const entryCode = (e: string | EventsEntry) =>
  typeof e === 'string' ? e : e.code;
const entryType = (e: string | EventsEntry) =>
  typeof e === 'string' ? prefixOf(e) : (e.type ?? prefixOf(e.code));

/**
 * EventBadge — compact accent chip for an entered event code ("MD1").
 * Also used standalone in roster/matches tables (S3/S4). `seed` renders
 * inline — "MD1 (3)" — never as a separate column (G6).
 */
export function EventBadge({ code, seed }: { code: string; seed?: number | null }) {
  return (
    <span
      className="rounded-sm border border-accent/30 bg-accent/10 px-1 py-px text-3xs font-semibold text-accent sw-num"
      // The parenthesised number was unexplained on every surface it appeared
      // on — a reader could as easily have taken it for an entry count as for
      // a seed (BRST-2). Nothing else on those surfaces defines it.
      title={seed != null ? `${code} · seeded ${seed}` : code}
    >
      {code}
      {seed != null ? (
        <span className="font-normal opacity-80"> ({seed})</span>
      ) : null}
    </span>
  );
}

export function EventsControl({
  entries,
  types,
  renderTypeEditor,
  categoriesOpen,
}: {
  /** Entered event codes ("MD1", "XD2") — drives the collapsed badge
   *  summary per category. Pass `{code, type}` objects when a code's
   *  discipline can't be inferred from its prefix. */
  entries: Array<string | EventsEntry>;
  /** Every discipline code the consumer can edit — for Bracket, the
   *  disciplines its events actually declare. Given, categories are built
   *  from it (plus the entries) instead of the badminton five, so an
   *  operator-defined code gets a home and a category with no draw behind
   *  it never appears. Omit for the legacy all-five rendering. */
  types?: readonly string[];
  /** Expanded per-type editor row for a discipline code ("MS", "MD"…).
   *  Return null for types the consumer has nothing to edit. */
  renderTypeEditor: (typeCode: string) => ReactNode;
  /** Category ids ('singles' | 'doubles' | 'mixed', or an own-code
   *  category's code) initially expanded. Default: all collapsed. */
  categoriesOpen?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(categoriesOpen ?? []),
  );
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Every category here has at least one live type, so every disclosure has
  // a body: `categoriesFor` drops a default category whose codes no event
  // declares rather than rendering a caret over nothing.
  const categories = categoriesFor(types, entries.map(entryType));

  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-border">
      {categories.map((cat) => {
        const catEntries = entries.filter((e) =>
          cat.types.includes(entryType(e)),
        );
        const isOpen = open.has(cat.id);
        return (
          <div key={cat.id} className="border-b border-border/60 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(cat.id)}
              aria-expanded={isOpen}
              data-testid={`events-category-${cat.id}`}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
            >
              <CaretRight
                aria-hidden
                weight="bold"
                className={[
                  'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                  isOpen ? 'rotate-90' : '',
                ].join(' ')}
              />
              <span className={`${EYEBROW_CLASS} text-ink-3`}>
                {cat.label}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
                {catEntries.length > 0 ? (
                  catEntries.map((e) => (
                    <EventBadge key={entryCode(e)} code={entryCode(e)} />
                  ))
                ) : (
                  <span className="text-2xs italic text-muted-foreground">
                    Not entered
                  </span>
                )}
              </span>
            </button>
            {isOpen ? (
              <div className="flex flex-col gap-1.5 px-2 pb-2 pt-0.5">
                {cat.types.map((t) => (
                  <Fragment key={t}>{renderTypeEditor(t)}</Fragment>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
