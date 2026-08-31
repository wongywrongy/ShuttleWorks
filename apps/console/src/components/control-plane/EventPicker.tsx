/**
 * EventPicker — the one way to choose an event.
 *
 * Nine surfaces picked an event nine ways: a 74-option flat ungrouped Radix
 * Select with a 703px popover, a 76-checkbox list in a 380px dock, a chip
 * grid in an accordion, unicode ☑/☐ buttons with no `aria-pressed`, group
 * headers standing in for a picker, and two boards with no picker at all.
 * This replaces the option-rendering half of all of them. Grouping, search
 * and selection semantics live here; the trigger, the container and the write
 * path stay with the consumer.
 *
 * THREE THINGS IT DOES that the nine did not:
 *  - Search appears only past `EVENT_PICKER_SEARCH_THRESHOLD` options. Below
 *    it the whole list is already on screen and a search box is furniture.
 *    The box does not vanish as typing narrows the list — the threshold reads
 *    the option COUNT, not the match count.
 *  - Options group by discipline, in first-appearance order. Not a fixed
 *    MS/WS/MD/WD/XD table: operator-defined event codes are supported product
 *    behaviour, and a hardcoded label map is exactly what ships
 *    "BS1 - undefined 1" today (defect D1).
 *  - Selection is a native radio (single) or checkbox (multiple). Native
 *    because "keyboard-operable and announces its state" is then the
 *    platform's problem, not a roving-tabindex reimplementation's; the
 *    strip this replaces was glyph buttons that announced nothing.
 *
 * It renders options and nothing else: no store, no API, no idea what
 * picking one means. Height and scroll belong to whatever holds it.
 *
 * IN A POPOVER (table cell, header, anywhere anchored) put it inside
 * `PickerPopover.Panel`, which already owns the portal, collision handling
 * and Esc/outside dismissal:
 *
 *   <PickerPopover open={open} onOpenChange={setOpen}>
 *     <PickerPopover.Anchor asChild><div ref={anchor}>{trigger}</div></PickerPopover.Anchor>
 *     <PickerPopover.Panel guardRef={anchor} className="w-72">
 *       <EventPicker options={events} ariaLabel="Event" value={id}
 *                    onChange={(next) => { save(next); setOpen(false); }} />
 *     </PickerPopover.Panel>
 *   </PickerPopover>
 *
 * IN A PANE render it directly inside a `DetailPanel.Section`.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Eyebrow } from './Eyebrow';

export interface EventPickerOption {
  /** Stable selection value. */
  id: string;
  /** Primary label, normally the event code ("XD3"). Rendered tabular. */
  code: string;
  /** Group key ("XD", "MD", or an operator's own code). */
  discipline: string;
  /** Longer name after the code, when the code alone is not enough. */
  name?: string;
  /** Right-aligned context: entry count, draw size, status. The Draws list
   *  already proves this is available and that it helps. Formatting is the
   *  consumer's — the picker owns where it sits, not what it says. */
  meta?: ReactNode;
  /** Occupant name(s) when the option is a SLOT someone already holds
   *  (PICK-2). Renders in the meta position, mutes the unselected row so
   *  open and occupied read apart at a glance, and joins the search
   *  haystack — finding which slots a player holds is the desk's real
   *  lookup during swaps. A plain string, unlike `meta`, precisely so it
   *  is searchable. */
  occupiedBy?: string;
  disabled?: boolean;
}

/** Past this many options the picker grows a search box. */
export const EVENT_PICKER_SEARCH_THRESHOLD = 10;

interface EventPickerCommon {
  options: readonly EventPickerOption[];
  /** Names the whole picker for assistive tech, e.g. "Event". */
  ariaLabel: string;
  testId?: string;
  /** Shown when the query matches nothing. */
  emptyLabel?: string;
  /** Collapsible discipline sections (PICK-2). Groups start closed except
   *  those listed in `defaultOpenGroups`; an active search overrides the
   *  collapse so matches are never hidden behind a closed caret. Off by
   *  default — the other consumers keep the always-expanded list. */
  collapsedGroups?: boolean;
  /** Discipline keys initially expanded when `collapsedGroups` is on —
   *  typically the disciplines where the player already holds an entry. */
  defaultOpenGroups?: readonly string[];
}

export type EventPickerProps = EventPickerCommon &
  (
    | {
        multiple?: false;
        value: string | null;
        onChange: (id: string | null) => void;
        /** Offer an explicit "no event" option. Single-select only: a radio
         *  cannot be unchecked by clicking it, so without this a chosen
         *  event can never be taken back. */
        clearable?: boolean;
        clearLabel?: string;
      }
    | {
        multiple: true;
        value: readonly string[];
        onChange: (ids: string[]) => void;
        /** Removable chips for the current selection, pinned above the
         *  list (PICK-1) — the selected state visible without scrolling.
         *  A chip whose option is `disabled` renders without its ×: the
         *  removal is locked for the same reason the row is. */
        selectedChips?: boolean;
      }
  );

/** Discipline groups in first-appearance order (Map preserves insertion). */
function groupByDiscipline(
  options: readonly EventPickerOption[],
): Array<[string, EventPickerOption[]]> {
  const groups = new Map<string, EventPickerOption[]>();
  for (const option of options) {
    const bucket = groups.get(option.discipline);
    if (bucket) bucket.push(option);
    else groups.set(option.discipline, [option]);
  }
  return [...groups];
}

const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm transition-colors duration-fast ease-brand hover:bg-muted/40';

export function EventPicker(props: EventPickerProps) {
  const {
    options,
    ariaLabel,
    testId = 'event-picker',
    emptyLabel = 'No events match this search.',
  } = props;
  const [query, setQuery] = useState('');
  const name = useId();

  const searchable = options.length > EVENT_PICKER_SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle === ''
        ? options
        : options.filter((o) =>
            `${o.code} ${o.name ?? ''} ${o.discipline} ${o.occupiedBy ?? ''}`
              .toLowerCase()
              .includes(needle),
          ),
    [options, needle],
  );
  const groups = useMemo(() => groupByDiscipline(matches), [matches]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(props.collapsedGroups ? (props.defaultOpenGroups ?? []) : []),
  );
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = new Set<string>(
    props.multiple ? props.value : props.value != null ? [props.value] : [],
  );
  const pick = (id: string) => {
    if (props.multiple) {
      const next = new Set(props.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      props.onChange([...next]);
      return;
    }
    props.onChange(id);
  };

  const row = (option: EventPickerOption) => {
    // An occupied, unselected slot reads muted — open and occupied must
    // not look identical (PICK-2). The occupant's name sits in the meta
    // position; an explicit `meta` (e.g. a lock reason) wins the slot.
    const occupied = option.occupiedBy != null && !selected.has(option.id);
    return (
      <label key={option.id} className={ROW_CLASS}>
        <input
          type={props.multiple ? 'checkbox' : 'radio'}
          name={props.multiple ? undefined : name}
          checked={selected.has(option.id)}
          disabled={option.disabled}
          onChange={() => pick(option.id)}
          className="h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <span
          className={[
            'sw-num shrink-0 font-semibold',
            occupied ? 'text-muted-foreground' : 'text-accent',
          ].join(' ')}
        >
          {option.code}
        </span>
        {option.name ? (
          <span className="min-w-0 break-words text-foreground">{option.name}</span>
        ) : null}
        {option.meta != null || option.occupiedBy != null ? (
          <span className="ml-auto shrink-0 pl-2 text-2xs text-muted-foreground">
            {option.meta ?? option.occupiedBy}
          </span>
        ) : null}
      </label>
    );
  };

  // PICK-1: the current selection as removable chips pinned above the
  // list — visible without scrolling. Options carry the display codes;
  // a selected id with no option (should not happen — legacy entries get
  // synthetic options) falls back to the raw id.
  const chips =
    props.multiple && props.selectedChips && props.value.length > 0 ? (
      <div
        data-testid={`${testId}-chips`}
        className="flex flex-wrap items-center gap-1 border-b border-border px-1.5 pb-1.5"
      >
        {props.value.map((id) => {
          const option = options.find((o) => o.id === id);
          const code = option?.code ?? id;
          const locked = option?.disabled ?? false;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-0.5 rounded-sm border border-accent/30 bg-action-selected-bg py-px pl-1 pr-0.5 text-3xs font-semibold text-action-selected-foreground sw-num"
            >
              {code}
              {locked ? null : (
                <button
                  type="button"
                  aria-label={`Remove ${code}`}
                  onClick={() => pick(id)}
                  className="rounded-sm p-0.5 text-accent transition-colors duration-fast ease-brand hover:bg-accent/20"
                >
                  <X aria-hidden className="h-2.5 w-2.5" weight="bold" />
                </button>
              )}
            </span>
          );
        })}
      </div>
    ) : null;

  return (
    <div data-testid={testId} className="flex min-w-0 flex-col">
      {chips}
      {searchable ? (
        <div className="flex items-center gap-2 border-b border-border px-1.5 pb-1.5">
          <label className="relative flex h-7 min-w-0 flex-1 items-center">
            <MagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              placeholder="Search"
              className="h-7 w-full rounded-sm border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {props.multiple ? (
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {selected.size} selected
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role="group"
        aria-label={ariaLabel}
        className="flex min-w-0 flex-col gap-0.5 pt-1"
      >
        {!props.multiple && props.clearable ? (
          <label className={ROW_CLASS}>
            <input
              type="radio"
              name={name}
              checked={props.value == null || props.value === ''}
              onChange={() => props.onChange(null)}
              className="h-3.5 w-3.5 shrink-0 accent-accent"
            />
            <span className="text-muted-foreground">
              {props.clearLabel ?? 'No event'}
            </span>
          </label>
        ) : null}

        {groups.map(([discipline, entries]) => {
          // A live search overrides the collapse — a match hidden behind
          // a closed caret is a match that does not exist to the operator.
          const open =
            !props.collapsedGroups || needle !== '' || openGroups.has(discipline);
          return (
            <div
              key={discipline}
              role="group"
              aria-label={discipline}
              className="flex min-w-0 flex-col"
            >
              {props.collapsedGroups ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(discipline)}
                  aria-expanded={open}
                  data-testid={`${testId}-section-${discipline}`}
                  className="flex w-full items-center gap-1.5 px-1.5 pb-0.5 pt-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/40"
                >
                  <CaretRight
                    aria-hidden
                    weight="bold"
                    className={[
                      'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                      open ? 'rotate-90' : '',
                    ].join(' ')}
                  />
                  <Eyebrow>{discipline}</Eyebrow>
                </button>
              ) : (
                <div className="px-1.5 pb-0.5 pt-1.5">
                  <Eyebrow>{discipline}</Eyebrow>
                </div>
              )}
              {open ? entries.map(row) : null}
            </div>
          );
        })}

        {groups.length === 0 ? (
          <p className="px-1.5 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
