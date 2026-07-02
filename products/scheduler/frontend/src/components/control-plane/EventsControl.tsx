/**
 * EventsControl — categorized collapsible chrome for a player's event
 * entries. CHROME ONLY: what an "entry" means (Meet rank chips, Bracket
 * participant rows) is injected via `renderTypeEditor` — this component
 * has no write path and no semantics of its own.
 *
 * Fixed category grammar (badminton disciplines):
 *   Singles → MS, WS · Doubles → MD, WD · Mixed → XD
 *
 * Collapsed, each category header summarizes its entered codes as
 * compact `EventBadge`s (or muted-italic "Not entered"); clicking the
 * header expands the category to the consumer-supplied per-type editor
 * rows. All categories start collapsed unless listed in `categoriesOpen`.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';

export interface EventCategory {
  id: string;
  label: string;
  /** Discipline type codes in this category (e.g. ['MS', 'WS']). */
  types: string[];
}

/** The fixed discipline categorization shared by Meet and Bracket. */
export const EVENT_CATEGORIES: EventCategory[] = [
  { id: 'singles', label: 'Singles', types: ['MS', 'WS'] },
  { id: 'doubles', label: 'Doubles', types: ['MD', 'WD'] },
  { id: 'mixed', label: 'Mixed', types: ['XD'] },
];

/** Discipline prefix of an entry code: "MD2" → "MD". */
const prefixOf = (code: string) => code.replace(/\d+$/, '');

/**
 * EventBadge — compact accent chip for an entered event code ("MD1").
 * Also used standalone in roster/matches tables (S3/S4).
 */
export function EventBadge({ code }: { code: string }) {
  return (
    <span className="rounded-sm border border-accent/30 bg-accent/10 px-1 py-px text-3xs font-semibold text-accent sw-num">
      {code}
    </span>
  );
}

export function EventsControl({
  entries,
  renderTypeEditor,
  categoriesOpen,
}: {
  /** Entered event codes ("MD1", "XD2") — drives the collapsed badge
   *  summary per category. */
  entries: string[];
  /** Expanded per-type editor row for a discipline code ("MS", "MD"…).
   *  Return null for types the consumer has nothing to edit. */
  renderTypeEditor: (typeCode: string) => ReactNode;
  /** Category ids ('singles' | 'doubles' | 'mixed') initially expanded.
   *  Default: all collapsed. */
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

  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-border">
      {EVENT_CATEGORIES.map((cat) => {
        const catEntries = entries.filter((e) => cat.types.includes(prefixOf(e)));
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
              <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                {cat.label}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
                {catEntries.length > 0 ? (
                  catEntries.map((code) => <EventBadge key={code} code={code} />)
                ) : (
                  <span className="text-2xs italic text-muted-foreground/70">
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
