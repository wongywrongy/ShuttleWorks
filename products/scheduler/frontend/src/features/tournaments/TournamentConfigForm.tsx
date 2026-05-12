/**
 * TournamentConfigForm — section 01 (Tournament) of the Setup tab.
 *
 * Every field goes through the shared `<Row label control [last] />`
 * wrapper from features/settings/SettingsControls. No descriptions,
 * no one-off layouts. Sections demarcated by SectionHeader.
 *
 * Existing dirty-check state model preserved verbatim so an autosave
 * from another tab can't clobber an in-flight edit.
 *
 * Advanced solver fields, TV display options, and engine settings flow
 * through `formData` unchanged so saving here doesn't clobber values
 * set in the Engine or Display panes.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { isValidTime } from '../../lib/time';
import { Button } from '@/components/ui/button';
import {
  Row,
  SectionHeader,
  Seg,
  Toggle,
  TextInput,
  DateInput,
  TimeInput,
  NumberInput,
  NumberWithSuffix,
  SelectInput,
} from '../settings/SettingsControls';

interface TournamentConfigFormProps {
  config: TournamentConfig;
  onSave: (config: TournamentConfig) => void;
  saving: boolean;
}

const MEET_TYPE_OPTIONS = [
  { value: 'dual' as const, label: 'Dual' },
  { value: 'tri' as const,  label: 'Tri'  },
];

const SCORE_TYPE_OPTIONS = [
  { value: 'simple' as const,    label: 'Simple' },
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

export function TournamentConfigForm({
  config,
  onSave,
  saving,
}: TournamentConfigFormProps) {
  const [formData, setFormData] = useState<TournamentConfig>({
    ...config,
    rankCounts: config.rankCounts || { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
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

  // Break-window: one editable break, mapped into the array.
  const firstBreak: BreakWindow | undefined = breakWindows[0];
  const breakStart = firstBreak?.start ?? '';
  const breakEnd = firstBreak?.end ?? '';
  const setBreakStart = (v: string) =>
    setBreakWindows((wins) =>
      wins.length === 0
        ? v ? [{ start: v, end: '' }] : []
        : [{ ...wins[0], start: v }, ...wins.slice(1)]
    );
  const setBreakEnd = (v: string) =>
    setBreakWindows((wins) =>
      wins.length === 0
        ? v ? [{ start: '', end: v }] : []
        : [{ ...wins[0], end: v }, ...wins.slice(1)]
    );

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
      const cleanedBreaks = breakWindows.filter((bw) => bw.start || bw.end);
      onSave({ ...formData, breaks: cleanedBreaks });
    }
  };

  const ranks = formData.rankCounts ?? { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 };
  const setRank = (key: 'MS' | 'WS' | 'MD' | 'WD' | 'XD', n: number) =>
    setFormData((prev) => ({
      ...prev,
      rankCounts: { ...(prev.rankCounts ?? ranks), [key]: n },
    }));

  function set<K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
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

      <SectionHeader>Schedule &amp; venue</SectionHeader>
      <Row label="Date" control={
        <DateInput value={formData.tournamentDate ?? ''} onChange={(v) => set('tournamentDate', v)} ariaLabel="Tournament date" />
      } />
      <Row label="Start time" control={
        <TimeInput value={formData.dayStart} onChange={(v) => set('dayStart', v)} ariaLabel="Day start" />
      } />
      <Row label="End time" control={
        <TimeInput value={formData.dayEnd} onChange={(v) => set('dayEnd', v)} ariaLabel="Day end" />
      } />
      <Row label="Slot duration" control={
        <NumberWithSuffix value={formData.intervalMinutes} onChange={(v) => set('intervalMinutes', v)} suffix="min" min={5} max={240} ariaLabel="Slot duration in minutes" />
      } />
      <Row label="Courts" control={
        <NumberInput value={formData.courtCount} onChange={(v) => set('courtCount', v)} min={1} max={32} ariaLabel="Court count" />
      } />
      <Row label="Break start" control={
        <TimeInput value={breakStart} onChange={setBreakStart} ariaLabel="Break start" />
      } />
      <Row label="Break end" control={
        <TimeInput value={breakEnd} onChange={setBreakEnd} ariaLabel="Break end" />
      } />
      <Row label="Rest between matches" control={
        <NumberWithSuffix value={formData.defaultRestMinutes} onChange={(v) => set('defaultRestMinutes', v)} suffix="min" min={0} max={120} ariaLabel="Rest between matches" />
      } last />

      <SectionHeader>Scoring</SectionHeader>
      <Row label="Score type" control={
        <Seg options={SCORE_TYPE_OPTIONS} value={formData.scoringFormat ?? 'badminton'} onChange={(v) => set('scoringFormat', v)} ariaLabel="Score type" />
      } />
      <Row label="Match format" control={
        <SelectInput value={formData.setsToWin ?? 2} onChange={(v) => set('setsToWin', v)} options={MATCH_FORMAT_OPTIONS} ariaLabel="Match format" />
      } />
      <Row label="Points per set" control={
        <SelectInput value={formData.pointsPerSet ?? 21} onChange={(v) => set('pointsPerSet', v)} options={POINTS_PER_SET_OPTIONS} ariaLabel="Points per set" />
      } />
      <Row label="Deuce (win by 2)" control={
        <Toggle value={formData.deuceEnabled ?? true} onChange={(v) => set('deuceEnabled', v)} ariaLabel="Deuce enabled" />
      } last />

      <SectionHeader>Events</SectionHeader>
      <Row label="Men's singles" control={
        <NumberInput value={ranks.MS ?? 3} onChange={(n) => setRank('MS', n)} min={0} max={20} ariaLabel="Men's singles positions" />
      } />
      <Row label="Women's singles" control={
        <NumberInput value={ranks.WS ?? 3} onChange={(n) => setRank('WS', n)} min={0} max={20} ariaLabel="Women's singles positions" />
      } />
      <Row label="Men's doubles" control={
        <NumberInput value={ranks.MD ?? 2} onChange={(n) => setRank('MD', n)} min={0} max={20} ariaLabel="Men's doubles positions" />
      } />
      <Row label="Women's doubles" control={
        <NumberInput value={ranks.WD ?? 2} onChange={(n) => setRank('WD', n)} min={0} max={20} ariaLabel="Women's doubles positions" />
      } />
      <Row label="Mixed doubles" control={
        <NumberInput value={ranks.XD ?? 2} onChange={(n) => setRank('XD', n)} min={0} max={20} ariaLabel="Mixed doubles positions" />
      } last />

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
