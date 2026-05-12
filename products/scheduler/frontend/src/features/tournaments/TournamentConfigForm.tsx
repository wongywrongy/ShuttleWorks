/**
 * TournamentConfigForm — Tournament settings (the first pane of the
 * Setup tab) rebuilt with strict uniform rows.
 *
 * Every field goes through the local `<Row label control [last] />`
 * wrapper. No bespoke layouts, no descriptions: labels only. Sections
 * are demarcated by a small uppercase header, never by a nested card.
 *
 * Existing dirty-check state model is preserved verbatim so an autosave
 * from another tab can't clobber an unsaved edit:
 *   - `baselineRef` tracks the LAST `config` prop we accepted.
 *   - On a new `config` prop, each field is adopted only if the user
 *     hasn't touched it (formData[k] still equals baseline[k]).
 *   - `breakWindows` gets the same treatment on structural equality.
 *
 * Advanced solver fields (court utilization, game proximity, compact
 * schedule, player overlap, TV display options, engine settings) are
 * not edited from this form. They flow through `formData` unchanged so
 * saving here doesn't clear values set in the Engine or Display panes.
 */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { isValidTime } from '../../lib/time';
import { Button } from '@/components/ui/button';

interface TournamentConfigFormProps {
  config: TournamentConfig;
  onSave: (config: TournamentConfig) => void;
  saving: boolean;
}

/* =========================================================================
 * Row — the strict uniform layout for every field.
 * ========================================================================= */
interface RowProps {
  label: string;
  control: ReactNode;
  last?: boolean;
}

function Row({ label, control, last }: RowProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-6 h-11',
        last ? '' : 'border-b border-border/60',
      ].join(' ')}
    >
      <span className="text-[13px] font-medium text-foreground flex-1">
        {label}
      </span>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

/* =========================================================================
 * Section header — small uppercase chrome between row groups.
 * ========================================================================= */
function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="pt-6 pb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

/* =========================================================================
 * Seg — segmented control (radio-group). One option always selected.
 * ========================================================================= */
interface SegOption<T extends string> {
  value: T;
  label: string;
}

function Seg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex border border-border overflow-hidden"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              'px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-accent/15 text-accent'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
 * Toggle — boolean switch. brand-accent on / muted off.
 * ========================================================================= */
function Toggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={() => onChange(!value)}
      className={[
        'inline-flex h-5 w-9 items-center rounded-full transition-colors',
        value ? 'bg-accent' : 'bg-muted',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-bg-elev transition-transform',
          value ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

/* =========================================================================
 * Reusable control wrappers — consistent sizing for the row right side.
 * ========================================================================= */
const TEXT_INPUT_CLASS =
  'h-7 rounded-sm border border-border bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

function TextInput({
  value,
  onChange,
  width,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  width: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={TEXT_INPUT_CLASS}
      style={{ width: `${width}px` }}
    />
  );
}

function DateInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={TEXT_INPUT_CLASS}
      style={{ width: '160px' }}
    />
  );
}

function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={TEXT_INPUT_CLASS}
      style={{ width: '110px' }}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  width = 64,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  width?: number;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className={`${TEXT_INPUT_CLASS} tabular-nums`}
      style={{ width: `${width}px` }}
    />
  );
}

function NumberWithSuffix({
  value,
  onChange,
  suffix,
  min,
  max,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <NumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        width={64}
        ariaLabel={ariaLabel}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

function SelectInput<T extends string | number>({
  value,
  onChange,
  options,
  width = 180,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  width?: number;
  ariaLabel?: string;
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        // Re-coerce based on the option type. Selects always return string.
        const target = options.find((o) => String(o.value) === raw);
        if (target) onChange(target.value);
      }}
      aria-label={ariaLabel}
      className={TEXT_INPUT_CLASS}
      style={{ width: `${width}px` }}
    >
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* =========================================================================
 * Static option lists.
 * ========================================================================= */
const MEET_TYPE_OPTIONS = [
  { value: 'dual' as const, label: 'Dual' },
  { value: 'tri' as const, label: 'Tri' },
];

const SCORE_TYPE_OPTIONS = [
  { value: 'simple' as const, label: 'Simple' },
  { value: 'badminton' as const, label: 'Badminton sets' },
];

const MATCH_FORMAT_OPTIONS = [
  { value: 1, label: 'Best of 1' },
  { value: 2, label: 'Best of 3' },
  { value: 3, label: 'Best of 5' },
];

const POINTS_PER_SET_OPTIONS = [
  { value: 11, label: '11 points' },
  { value: 15, label: '15 points' },
  { value: 21, label: '21 points' },
];

/* =========================================================================
 * Main component.
 * ========================================================================= */
export function TournamentConfigForm({
  config,
  onSave,
  saving,
}: TournamentConfigFormProps) {
  const [formData, setFormData] = useState<TournamentConfig>({
    ...config,
    rankCounts: config.rankCounts || { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
    enableCourtUtilization: config.enableCourtUtilization ?? true,
    courtUtilizationPenalty: config.courtUtilizationPenalty ?? 50.0,
    enableGameProximity: config.enableGameProximity ?? false,
    minGameSpacingSlots: config.minGameSpacingSlots ?? null,
    maxGameSpacingSlots: config.maxGameSpacingSlots ?? null,
    gameProximityPenalty: config.gameProximityPenalty ?? 5.0,
    enableCompactSchedule: config.enableCompactSchedule ?? false,
    compactScheduleMode: config.compactScheduleMode ?? 'minimize_makespan',
    compactSchedulePenalty: config.compactSchedulePenalty ?? 100.0,
    targetFinishSlot: config.targetFinishSlot ?? null,
    allowPlayerOverlap: config.allowPlayerOverlap ?? false,
    playerOverlapPenalty: config.playerOverlapPenalty ?? 50.0,
    deterministic: config.deterministic ?? false,
    randomSeed: config.randomSeed ?? 42,
    solverTimeLimitSeconds: config.solverTimeLimitSeconds ?? 30,
    candidatePoolSize: config.candidatePoolSize ?? 5,
    scoringFormat: config.scoringFormat ?? 'badminton',
    setsToWin: config.setsToWin ?? 2,
    pointsPerSet: config.pointsPerSet ?? 21,
    deuceEnabled: config.deuceEnabled ?? true,
    meetMode: config.meetMode ?? 'dual',
    tournamentName: config.tournamentName ?? '',
    tournamentDate: config.tournamentDate ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [breakWindows, setBreakWindows] = useState<BreakWindow[]>(
    config.breaks || []
  );

  // Dirty-check baselines (preserved from the prior implementation).
  const baselineRef = useRef<TournamentConfig>(config);
  const breakBaselineRef = useRef<BreakWindow[]>(config.breaks ?? []);

  useEffect(() => {
    setFormData((prev) => {
      const merged: TournamentConfig = { ...prev };
      const prevBaseline = baselineRef.current;
      (Object.keys(config) as Array<keyof TournamentConfig>).forEach((key) => {
        const userTouched =
          JSON.stringify(prev[key]) !== JSON.stringify(prevBaseline[key]);
        if (!userTouched) {
          (merged as unknown as Record<string, unknown>)[key] = config[key];
        }
      });
      if (merged.scoringFormat == null) merged.scoringFormat = 'badminton';
      if (merged.setsToWin == null) merged.setsToWin = 2;
      if (merged.pointsPerSet == null) merged.pointsPerSet = 21;
      if (merged.deuceEnabled == null) merged.deuceEnabled = true;
      if (merged.meetMode == null) merged.meetMode = 'dual';
      return merged;
    });
    const prevBreaks = breakBaselineRef.current;
    const breakUserTouched =
      JSON.stringify(breakWindows) !== JSON.stringify(prevBreaks);
    if (!breakUserTouched) {
      setBreakWindows(config.breaks ?? []);
    }
    baselineRef.current = config;
    breakBaselineRef.current = config.breaks ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  /* ------- Break-window: one editable break, mapped into the array. ------ */
  const firstBreak: BreakWindow | undefined = breakWindows[0];
  const breakStart = firstBreak?.start ?? '';
  const breakEnd = firstBreak?.end ?? '';
  const setBreakStart = (v: string) =>
    setBreakWindows((wins) =>
      wins.length === 0
        ? v
          ? [{ start: v, end: '' }]
          : []
        : [{ ...wins[0], start: v }, ...wins.slice(1)]
    );
  const setBreakEnd = (v: string) =>
    setBreakWindows((wins) =>
      wins.length === 0
        ? v
          ? [{ start: '', end: v }]
          : []
        : [{ ...wins[0], end: v }, ...wins.slice(1)]
    );

  /* ------- Validation. ------- */
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!isValidTime(formData.dayStart)) next.dayStart = 'Invalid time';
    if (!isValidTime(formData.dayEnd)) next.dayEnd = 'Invalid time';
    if (formData.intervalMinutes < 5) next.intervalMinutes = 'Min 5 minutes';
    if (formData.courtCount < 1) next.courtCount = 'Min 1 court';
    if (formData.defaultRestMinutes < 0)
      next.defaultRestMinutes = 'Cannot be negative';
    breakWindows.forEach((bw, i) => {
      if (bw.start && !isValidTime(bw.start)) next[`break_${i}_start`] = 'Invalid';
      if (bw.end && !isValidTime(bw.end)) next[`break_${i}_end`] = 'Invalid';
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      // Drop empty break windows on save (both fields empty = no break).
      const cleanedBreaks = breakWindows.filter((bw) => bw.start || bw.end);
      onSave({ ...formData, breaks: cleanedBreaks });
    }
  };

  /* ------- Rank-count helpers (one per event row). ------- */
  const ranks = formData.rankCounts ?? { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 };
  const setRank = (key: 'MS' | 'WS' | 'MD' | 'WD' | 'XD', n: number) =>
    setFormData((prev) => ({
      ...prev,
      rankCounts: { ...(prev.rankCounts ?? ranks), [key]: n },
    }));

  /* ------- Generic field setter. ------- */
  function set<K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  /* ===================================================================== */

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      {/* IDENTITY */}
      <SectionHeader>Identity</SectionHeader>
      <Row
        label="Tournament name"
        control={
          <TextInput
            value={formData.tournamentName ?? ''}
            onChange={(v) => set('tournamentName', v)}
            width={200}
            placeholder="My tournament"
            ariaLabel="Tournament name"
          />
        }
      />
      <Row
        label="Meet type"
        control={
          <Seg
            options={MEET_TYPE_OPTIONS}
            value={formData.meetMode ?? 'dual'}
            onChange={(v) => set('meetMode', v)}
            ariaLabel="Meet type"
          />
        }
        last
      />

      {/* SCHEDULE & VENUE */}
      <SectionHeader>Schedule &amp; venue</SectionHeader>
      <Row
        label="Date"
        control={
          <DateInput
            value={formData.tournamentDate ?? ''}
            onChange={(v) => set('tournamentDate', v)}
            ariaLabel="Tournament date"
          />
        }
      />
      <Row
        label="Start time"
        control={
          <TimeInput
            value={formData.dayStart}
            onChange={(v) => set('dayStart', v)}
            ariaLabel="Day start"
          />
        }
      />
      <Row
        label="End time"
        control={
          <TimeInput
            value={formData.dayEnd}
            onChange={(v) => set('dayEnd', v)}
            ariaLabel="Day end"
          />
        }
      />
      <Row
        label="Slot duration"
        control={
          <NumberWithSuffix
            value={formData.intervalMinutes}
            onChange={(v) => set('intervalMinutes', v)}
            suffix="min"
            min={5}
            max={240}
            ariaLabel="Slot duration in minutes"
          />
        }
      />
      <Row
        label="Courts"
        control={
          <NumberInput
            value={formData.courtCount}
            onChange={(v) => set('courtCount', v)}
            min={1}
            max={32}
            ariaLabel="Court count"
          />
        }
      />
      <Row
        label="Break start"
        control={
          <TimeInput
            value={breakStart}
            onChange={setBreakStart}
            ariaLabel="Break start"
          />
        }
      />
      <Row
        label="Break end"
        control={
          <TimeInput
            value={breakEnd}
            onChange={setBreakEnd}
            ariaLabel="Break end"
          />
        }
      />
      <Row
        label="Rest between matches"
        control={
          <NumberWithSuffix
            value={formData.defaultRestMinutes}
            onChange={(v) => set('defaultRestMinutes', v)}
            suffix="min"
            min={0}
            max={120}
            ariaLabel="Rest between matches in minutes"
          />
        }
        last
      />

      {/* SCORING */}
      <SectionHeader>Scoring</SectionHeader>
      <Row
        label="Score type"
        control={
          <Seg
            options={SCORE_TYPE_OPTIONS}
            value={formData.scoringFormat ?? 'badminton'}
            onChange={(v) => set('scoringFormat', v)}
            ariaLabel="Score type"
          />
        }
      />
      <Row
        label="Match format"
        control={
          <SelectInput
            value={formData.setsToWin ?? 2}
            onChange={(v) => set('setsToWin', v)}
            options={MATCH_FORMAT_OPTIONS}
            width={180}
            ariaLabel="Match format"
          />
        }
      />
      <Row
        label="Points per set"
        control={
          <SelectInput
            value={formData.pointsPerSet ?? 21}
            onChange={(v) => set('pointsPerSet', v)}
            options={POINTS_PER_SET_OPTIONS}
            width={180}
            ariaLabel="Points per set"
          />
        }
      />
      <Row
        label="Deuce (win by 2)"
        control={
          <Toggle
            value={formData.deuceEnabled ?? true}
            onChange={(v) => set('deuceEnabled', v)}
            ariaLabel="Deuce enabled"
          />
        }
        last
      />

      {/* EVENTS */}
      <SectionHeader>Events</SectionHeader>
      <Row
        label="Men's singles"
        control={
          <NumberInput
            value={ranks.MS ?? 3}
            onChange={(n) => setRank('MS', n)}
            min={0}
            max={20}
            ariaLabel="Men's singles positions"
          />
        }
      />
      <Row
        label="Women's singles"
        control={
          <NumberInput
            value={ranks.WS ?? 3}
            onChange={(n) => setRank('WS', n)}
            min={0}
            max={20}
            ariaLabel="Women's singles positions"
          />
        }
      />
      <Row
        label="Men's doubles"
        control={
          <NumberInput
            value={ranks.MD ?? 2}
            onChange={(n) => setRank('MD', n)}
            min={0}
            max={20}
            ariaLabel="Men's doubles positions"
          />
        }
      />
      <Row
        label="Women's doubles"
        control={
          <NumberInput
            value={ranks.WD ?? 2}
            onChange={(n) => setRank('WD', n)}
            min={0}
            max={20}
            ariaLabel="Women's doubles positions"
          />
        }
      />
      <Row
        label="Mixed doubles"
        control={
          <NumberInput
            value={ranks.XD ?? 2}
            onChange={(n) => setRank('XD', n)}
            min={0}
            max={20}
            ariaLabel="Mixed doubles positions"
          />
        }
        last
      />

      {/* SAVE — appears below Events, outside any Row to keep the row
          uniformity rule intact (Row is for label+control pairs only). */}
      {Object.keys(errors).length > 0 && (
        <div className="mt-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Fix the highlighted fields before saving:
          <ul className="mt-1 list-disc pl-5">
            {Object.entries(errors).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}</span>: {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save tournament settings'}
        </Button>
      </div>
    </form>
  );
}
