/**
 * AvailabilityControl — the shared per-player availability editor.
 *
 * UNAVAILABLE-PERIODS UX over POSITIVE-window storage: operators think
 * in "when can't they play" (blocked windows), while the canonical
 * roster shape (`PlayerDTO.availability`, solver-wired) stores POSITIVE
 * allowed windows. `value`/`onChange` speak the canonical positive
 * shape; the control converts value→blocked for display and blocked→
 * allowed on every edit via the pure `availabilityWindows` helpers.
 *
 * `[]` value = "all day, no restrictions" (the empty state). A player
 * blocked for the whole day round-trips through the zero-width guard
 * window — see availabilityWindows.ts for the pinned semantics.
 */
import type { AvailabilityWindow } from '../../api/dto';
import {
  allowedToBlocked,
  blockedToAllowed,
  minutesToTime,
  timeToMinutes,
} from './availabilityWindows';

const TIME_INPUT_CLASSES =
  'h-7 rounded-sm border border-border bg-bg-elev px-1.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

/** Default new blocked period. 09:00–10:00 per spec; when that lies
 *  entirely outside the day bounds (it would normalize away and the
 *  button would look broken), fall back to the day's first hour. */
function defaultPeriod(dayStart: string, dayEnd: string): AvailabilityWindow {
  // Fixed-width "HH:mm" strings compare correctly lexicographically.
  if ('10:00' > dayStart && '09:00' < dayEnd) {
    return { start: '09:00', end: '10:00' };
  }
  const ds = timeToMinutes(dayStart);
  const de = timeToMinutes(dayEnd);
  return { start: dayStart, end: minutesToTime(Math.min(ds + 60, de)) };
}

export function AvailabilityControl({
  value,
  dayStart,
  dayEnd,
  onChange,
  disabled = false,
}: {
  /** POSITIVE (allowed) windows — the canonical `PlayerDTO.availability`
   *  shape. `[]` = all day, no restrictions. */
  value: AvailabilityWindow[];
  /** Tournament day bounds, "HH:mm". */
  dayStart: string;
  dayEnd: string;
  /** Receives the next POSITIVE window list on every edit. */
  onChange: (next: AvailabilityWindow[]) => void;
  disabled?: boolean;
}) {
  // Display state is derived, not held: value → blocked each render, so
  // the control can never drift from the canonical roster record.
  const blocked = allowedToBlocked(value, dayStart, dayEnd);

  const commit = (nextBlocked: AvailabilityWindow[]) =>
    onChange(blockedToAllowed(nextBlocked, dayStart, dayEnd));

  const updateAt = (index: number, patch: Partial<AvailabilityWindow>) =>
    commit(blocked.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  const removeAt = (index: number) =>
    commit(blocked.filter((_, i) => i !== index));

  const addPeriod = () => commit([...blocked, defaultPeriod(dayStart, dayEnd)]);

  return (
    <div data-testid="availability-control" className="flex flex-col gap-1.5">
      {blocked.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Available all day, no blocked windows.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {blocked.map((w, i) => (
            // Index keys are safe: rows are a derived, order-stable
            // projection with no per-row internal state.
            <li key={i} className="group flex items-center gap-1.5">
              <input
                type="time"
                value={w.start}
                disabled={disabled}
                aria-label={`Unavailable period ${i + 1} start`}
                data-testid={`availability-period-start-${i}`}
                onChange={(e) => {
                  // <input type="time"> emits '' mid-edit; ignore until
                  // the operator lands on a complete value.
                  if (e.target.value) updateAt(i, { start: e.target.value });
                }}
                className={TIME_INPUT_CLASSES}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="time"
                value={w.end}
                disabled={disabled}
                aria-label={`Unavailable period ${i + 1} end`}
                data-testid={`availability-period-end-${i}`}
                onChange={(e) => {
                  if (e.target.value) updateAt(i, { end: e.target.value });
                }}
                className={TIME_INPUT_CLASSES}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label={`Remove unavailable period ${i + 1}`}
                data-testid={`availability-period-remove-${i}`}
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors duration-fast ease-brand hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={addPeriod}
        data-testid="availability-add-period"
        className="self-start text-xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        ＋ Add unavailable period
      </button>
    </div>
  );
}
