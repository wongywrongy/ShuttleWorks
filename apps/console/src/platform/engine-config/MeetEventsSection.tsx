/**
 * MeetEventsSection — the Events rows of Meet Configuration.
 *
 * Events are USER-DEFINED, not a fixed five. The form used to render a
 * hardcoded MS/WS/MD/WD/XD list, which made the five look like a property of
 * the product; they are only the default seed for a new meet. Nothing below
 * the UI required them: `rankCounts` is `Dict[Code, int]` on the backend with
 * `Code` a plain bounded string, the DTO is `Record<string, number>`, and
 * every consumer (position grid, matches spreadsheet, rank validation, xlsx
 * export) already iterates the object's own keys and falls back to the raw
 * code when a name is unknown. So this is a form change, not a data-model
 * change — no migration, no schema edit.
 *
 * Known codes render their friendly name; a custom code renders as itself.
 * The `D`-suffix convention (`isDoubles`) is what marks a doubles event
 * downstream, so a custom doubles code should end in D — stated in the hint
 * rather than enforced, since a meet may legitimately want otherwise.
 *
 * Removing an event drops it from `rankCounts` only. Player rank assignments
 * live elsewhere and are keyed by rank string, so they are hidden rather than
 * destroyed and come back if the code is re-added — which is why removal is
 * not gated behind a confirm.
 */
import { useState } from 'react';

import { Button } from '@scheduler/design-system';
import { X } from '@phosphor-icons/react';

import { DISCIPLINE_NAMES } from '../../lib/disciplineNames';
import { Row, NumberWithSuffix } from './SettingsControls';
import { TextField } from '@scheduler/design-system/components';

/** Backend `MAX_RANKS` (limits.py). Exceeding it is a 422, so stop first. */
export const MAX_EVENTS = 50;
/** Backend `MAX_CODE` (limits.py). */
export const MAX_EVENT_CODE_LENGTH = 40;

export type RankCounts = Record<string, number>;

/** The seed for a NEW meet — a default, not a constraint. */
export const DEFAULT_RANKS: RankCounts = { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 };

export function eventLabel(code: string): string {
  return DISCIPLINE_NAMES[code] ?? code;
}

/**
 * Validate a proposed new event code against the codes already present.
 * Exported so the test suite states the rules once, against the real thing.
 */
export function validateEventCode(
  raw: string,
  existing: readonly string[],
): { code: string } | { error: string } {
  const code = raw.trim().toUpperCase();
  if (!code) return { error: 'Enter an event code.' };
  if (code.length > MAX_EVENT_CODE_LENGTH) {
    return { error: `Event codes are at most ${MAX_EVENT_CODE_LENGTH} characters.` };
  }
  // Ranks are addressed as prefix+digits ("MD2"), so a code carrying its own
  // digits would make "MD2" ambiguous between event MD position 2 and event
  // MD2 position 1.
  if (!/^[A-Z]+$/.test(code)) return { error: 'Use letters only, no digits or spaces.' };
  if (existing.includes(code)) return { error: `${code} is already an event.` };
  if (existing.length >= MAX_EVENTS) {
    return { error: `A meet can have at most ${MAX_EVENTS} events.` };
  }
  return { code };
}

export function MeetEventsSection({
  rankCounts,
  onChange,
  readOnly = false,
}: {
  rankCounts: RankCounts;
  onChange: (next: RankCounts) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const codes = Object.keys(rankCounts);

  const setCount = (code: string, n: number) =>
    onChange({ ...rankCounts, [code]: n });

  const remove = (code: string) => {
    const next = { ...rankCounts };
    delete next[code];
    onChange(next);
  };

  const add = () => {
    const result = validateEventCode(draft, codes);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    // Insertion order is the render order, so a new event lands at the end
    // where the operator just typed it.
    onChange({ ...rankCounts, [result.code]: 1 });
    setDraft('');
    setError(null);
  };

  return (
    <>
      {codes.map((code) => (
        <Row
          key={code}
          label={
            <span className="inline-flex items-baseline gap-2">
              {eventLabel(code)}
              <span className="text-xs font-semibold text-foreground sw-num">{code}</span>
            </span>
          }
          control={
            <span className="inline-flex items-center gap-2">
              <NumberWithSuffix
                value={rankCounts[code] ?? 0}
                onChange={(n) => setCount(code, n)}
                suffix="positions"
                min={0}
                max={20}
                ariaLabel={`${eventLabel(code)} positions`}
              />
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => remove(code)}
                  aria-label={`Remove ${eventLabel(code)}`}
                  title={`Remove ${eventLabel(code)}`}
                  className="rounded p-1 text-muted-foreground transition-colors duration-fast ease-brand hover:text-destructive"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          }
        />
      ))}

      {codes.length === 0 ? (
        <Row
          label="No events yet"
          control={
            <span className="text-xs text-muted-foreground">
              Add one below to start
            </span>
          }
        />
      ) : null}

      {readOnly ? null : (
        <Row
          last
          label="Add event"
          control={
            <span className="inline-flex items-start gap-2">
              <TextField
                label="Event code"
                size="sm"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // This section renders inside the config form; Enter here
                    // means "add", never "submit the whole surface".
                    e.preventDefault();
                    add();
                  }
                }}
                error={error ?? undefined}
                placeholder="e.g. BS"
                /* `uppercase` styles the placeholder too, which rendered the
                   hint as "E.G. BS" — shouted, and implying the literal text
                   is what you type. */
                inputClassName="w-28 uppercase placeholder:normal-case"
                className="[&>label]:sr-only"
              />
              <Button type="button" variant="outline" size="xs" onClick={add}>
                Add
              </Button>
            </span>
          }
        />
      )}
    </>
  );
}
