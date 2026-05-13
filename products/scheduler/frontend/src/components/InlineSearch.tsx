/**
 * Inline search + filter row.
 *
 * Drops into the top of any list surface (Roster / Matches / Schedule).
 * Visual: a single 28px-tall row — search input on the left, optional
 * filter chip groups on the right, and a result-count read-out at the
 * far right. No card chrome, no headers — meant to read as part of
 * the surface itself.
 *
 * Filter state is owned by the caller (URL-backed via
 * ``useSearchParamState`` / ``useSearchParamSet``). This component is
 * presentational beyond owning its own focus/clear state.
 */
import { useEffect, useRef } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { INTERACTIVE_BASE, INTERACTIVE_BASE_QUIET } from '../lib/utils';

export interface FilterChipGroup {
  label: string;
  options: { id: string; label: string }[];
  /** Currently-active option ids. */
  active: Set<string>;
  /** Toggle one option's active state. */
  onToggle: (id: string) => void;
}

interface InlineSearchProps {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder?: string;
  /** Right-side filter chip groups. Render order = props order. */
  filters?: FilterChipGroup[];
  /** When set, shows ``"<count> of <total>"`` flush right. */
  resultCount?: { shown: number; total: number };
  /** When ``true`` and any filter or query is active, shows an
   *  inline "Clear" button after the result count. */
  showClear?: boolean;
  onClearAll?: () => void;
  /** Optional keyboard shortcut hint. Defaults to ``cmd+k``. The
   *  shortcut handler is registered while this component is mounted. */
  focusKey?: string;
}

export function InlineSearch({
  query,
  onQueryChange,
  placeholder = 'Search…',
  filters = [],
  resultCount,
  showClear,
  onClearAll,
  focusKey = 'k',
}: InlineSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // cmd+k / ctrl+k focuses the search while this surface is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === focusKey.toLowerCase()) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusKey]);

  const anyFilterActive = filters.some((g) => g.active.size > 0);
  const hasInput = query.trim().length > 0;
  const canClear = showClear && (anyFilterActive || hasInput);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {/* Search input */}
      <label className="relative inline-flex h-7 min-w-[200px] flex-1 items-center">
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className={[
            'h-7 w-full rounded border border-border bg-background pl-7 pr-7 text-xs',
            'placeholder:text-muted-foreground/70',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          ].join(' ')}
        />
        {hasInput && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className={`${INTERACTIVE_BASE_QUIET} absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground`}
            aria-label="Clear search"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        )}
      </label>

      {/* Filter chip groups */}
      {filters.map((g) => (
        <FilterGroup key={g.label} group={g} />
      ))}

      {/* Result count + clear */}
      {(resultCount || canClear) && (
        <div className="ml-auto flex items-center gap-2 text-2xs text-muted-foreground">
          {resultCount && (
            <span className="tabular-nums">
              {resultCount.shown === resultCount.total
                ? `${resultCount.total}`
                : `${resultCount.shown} of ${resultCount.total}`}
            </span>
          )}
          {canClear && (
            <button
              type="button"
              onClick={onClearAll}
              className={`${INTERACTIVE_BASE_QUIET} rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground`}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ group }: { group: FilterChipGroup }) {
  return (
    <div role="group" aria-label={group.label} className="inline-flex items-center gap-1">
      <span className="text-2xs uppercase tracking-wider text-muted-foreground">
        {group.label}
      </span>
      <div className="inline-flex flex-wrap items-center gap-1">
        {group.options.map((opt) => {
          const isActive = group.active.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => group.onToggle(opt.id)}
              aria-pressed={isActive}
              className={[
                INTERACTIVE_BASE,
                'inline-flex h-6 items-center rounded border px-2 text-2xs font-medium',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              ].join(' ')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
