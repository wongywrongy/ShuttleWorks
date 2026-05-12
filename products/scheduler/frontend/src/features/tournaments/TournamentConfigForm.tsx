import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { isValidTime } from '../../lib/time';
import { SetupGuide } from './SetupGuide';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Surface, Section } from '../settings/SettingsPrimitives';

interface TournamentConfigFormProps {
  config: TournamentConfig;
  onSave: (config: TournamentConfig) => void;
  saving: boolean;
}

export function TournamentConfigForm({ config, onSave, saving }: TournamentConfigFormProps) {
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
    // Engine fields (deterministic, randomSeed, solverTimeLimitSeconds,
    // candidatePoolSize) are owned by the Engine settings pane —
    // copied through formData so saving the Tournament form doesn't
    // wipe them out, but never edited from this UI.
    deterministic: config.deterministic ?? false,
    randomSeed: config.randomSeed ?? 42,
    solverTimeLimitSeconds: config.solverTimeLimitSeconds ?? 30,
    candidatePoolSize: config.candidatePoolSize ?? 5,
    // Badminton is the app's domain; default to per-set scoring so the
    // Live-page Finish dialog asks for game scores instead of a single
    // sideA/sideB aggregate.
    scoringFormat: config.scoringFormat ?? 'badminton',
    setsToWin: config.setsToWin ?? 2,
    pointsPerSet: config.pointsPerSet ?? 21,
    deuceEnabled: config.deuceEnabled ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [breakWindows, setBreakWindows] = useState<BreakWindow[]>(config.breaks || []);
  const [showGuide, setShowGuide] = useState(false);

  // Baseline ref tracks the LAST config prop we accepted from the parent.
  // When a new config arrives (hydration lands, another tab saved, etc.)
  // we compare field-by-field: if formData[key] still matches the
  // previous baseline, the user hasn't touched it and we can safely
  // adopt the incoming value. If formData[key] has drifted from the
  // baseline, the user has a pending edit and we must NOT clobber it.
  // Stops a debounced autosave in another tab from wiping what the user
  // is still typing.
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
      // Preserve the badminton defaults when the server returned null.
      if (merged.scoringFormat == null) merged.scoringFormat = 'badminton';
      if (merged.setsToWin == null) merged.setsToWin = 2;
      if (merged.pointsPerSet == null) merged.pointsPerSet = 21;
      if (merged.deuceEnabled == null) merged.deuceEnabled = true;
      return merged;
    });
    // Breaks array gets the same dirty-check, on structural equality.
    const prevBreaks = breakBaselineRef.current;
    const breakUserTouched =
      JSON.stringify(breakWindows) !== JSON.stringify(prevBreaks);
    if (!breakUserTouched) {
      setBreakWindows(config.breaks ?? []);
    }
    baselineRef.current = config;
    breakBaselineRef.current = config.breaks ?? [];
    // `breakWindows` is intentionally excluded — including it would
    // re-run this effect on every user edit and defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!isValidTime(formData.dayStart)) {
      newErrors.dayStart = 'Invalid time format';
    }
    if (!isValidTime(formData.dayEnd)) {
      newErrors.dayEnd = 'Invalid time format';
    }
    if (formData.intervalMinutes < 5) {
      newErrors.intervalMinutes = 'Min 5 minutes';
    }
    if (formData.courtCount < 1) {
      newErrors.courtCount = 'Min 1 court';
    }
    if (formData.defaultRestMinutes < 0) {
      newErrors.defaultRestMinutes = 'Cannot be negative';
    }
    if (formData.freezeHorizonSlots < 0) {
      newErrors.freezeHorizonSlots = 'Cannot be negative';
    }

    breakWindows.forEach((breakWindow, index) => {
      if (!isValidTime(breakWindow.start)) {
        newErrors[`break_${index}_start`] = 'Invalid';
      }
      if (!isValidTime(breakWindow.end)) {
        newErrors[`break_${index}_end`] = 'Invalid';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({ ...formData, breaks: breakWindows });
    }
  };

  const addBreak = () => {
    setBreakWindows([...breakWindows, { start: '12:00', end: '13:00' }]);
  };

  const removeBreak = (index: number) => {
    setBreakWindows(breakWindows.filter((_, i) => i !== index));
  };

  const updateBreak = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...breakWindows];
    updated[index] = { ...updated[index], [field]: value };
    setBreakWindows(updated);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Surface>
          {/* IDENTITY — tournament name + meet mode. Top of the form so
              the rest of the page (matches, schedule chrome, backups)
              can reference the chosen name. The Setup-guide button is
              the section's right-side trailing affordance — it lives
              here because the guide explains the whole form below. */}
          <Section
            title="Identity"
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowGuide(true)}
                className="h-7 text-2xs text-muted-foreground hover:text-foreground"
              >
                Setup guide
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="tournamentName" className="text-xs">
                  Tournament name
                </Label>
                <Input
                  id="tournamentName"
                  type="text"
                  value={formData.tournamentName ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, tournamentName: e.target.value })
                  }
                  placeholder="Spring Open 2026"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Meet type</Label>
                <div role="radiogroup" aria-label="Meet type" className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
                  {(['dual', 'tri'] as const).map((mode) => {
                    const active = (formData.meetMode ?? 'dual') === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setFormData({ ...formData, meetMode: mode })}
                        className={[
                          'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                        ].join(' ')}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Schedule & venue"
            description='"Slot" is the time unit referenced everywhere else in the app — the freeze horizon, game spacing, breaks, and the Gantt all measure in slots.'
          >
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label htmlFor="date" className="text-xs">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.tournamentDate || ''}
                  onChange={(e) => setFormData({ ...formData, tournamentDate: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="start" className="text-xs">Start</Label>
                <Input
                  id="start"
                  type="time"
                  value={formData.dayStart}
                  onChange={(e) => setFormData({ ...formData, dayStart: e.target.value })}
                  className={`h-9 ${errors.dayStart ? 'border-destructive' : ''}`}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end" className="text-xs">End</Label>
                <Input
                  id="end"
                  type="time"
                  value={formData.dayEnd}
                  onChange={(e) => setFormData({ ...formData, dayEnd: e.target.value })}
                  className={`h-9 ${errors.dayEnd ? 'border-destructive' : ''}`}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="interval" className="text-xs">Slot (min)</Label>
                <Input
                  id="interval"
                  type="number"
                  value={formData.intervalMinutes}
                  onChange={(e) => setFormData({ ...formData, intervalMinutes: parseInt(e.target.value) || 30 })}
                  min={5}
                  max={120}
                  className={`h-9 ${errors.intervalMinutes ? 'border-destructive' : ''}`}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="courts" className="text-xs">Courts</Label>
                <Input
                  id="courts"
                  type="number"
                  value={formData.courtCount}
                  onChange={(e) => setFormData({ ...formData, courtCount: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={20}
                  className={`h-9 ${errors.courtCount ? 'border-destructive' : ''}`}
                />
              </div>
            </div>

            {/* Breaks — inline list under the schedule grid. Empty state
                collapses into a single dashed add button so the section's
                vertical footprint matches its content. */}
            <div className="space-y-2 pt-1">
              <div className="flex items-baseline justify-between">
                <Label className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Breaks
                </Label>
                {breakWindows.length > 0 && (
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {breakWindows.length}
                  </span>
                )}
              </div>
              {breakWindows.length > 0 && (
                <div className="space-y-1.5">
                  {breakWindows.map((breakWindow, index) => {
                    const startInvalid = errors[`break_${index}_start`];
                    const endInvalid = errors[`break_${index}_end`];
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5"
                      >
                        <Input
                          type="time"
                          aria-label={`Break ${index + 1} start`}
                          value={breakWindow.start}
                          onChange={(e) => updateBreak(index, 'start', e.target.value)}
                          className={`h-8 w-28 tabular-nums ${startInvalid ? 'border-destructive' : ''}`}
                        />
                        <span aria-hidden="true" className="text-muted-foreground select-none">→</span>
                        <Input
                          type="time"
                          aria-label={`Break ${index + 1} end`}
                          value={breakWindow.end}
                          onChange={(e) => updateBreak(index, 'end', e.target.value)}
                          className={`h-8 w-28 tabular-nums ${endInvalid ? 'border-destructive' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeBreak(index)}
                          aria-label={`Remove break ${index + 1}`}
                          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBreak}
                className="h-8 w-full justify-center border-dashed text-xs text-muted-foreground hover:bg-muted/40"
              >
                + Add break{breakWindows.length === 0 ? ' (e.g. lunch 12:00–13:00)' : ''}
              </Button>
            </div>
          </Section>

          <Section
            title="Players"
            description="Player welfare rules the solver respects when laying out a schedule."
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="rest" className="text-xs">
                  Rest between matches (min)
                </Label>
                <Input
                  id="rest"
                  type="number"
                  value={formData.defaultRestMinutes}
                  onChange={(e) => setFormData({ ...formData, defaultRestMinutes: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={180}
                  className={`h-9 ${errors.defaultRestMinutes ? 'border-destructive' : ''}`}
                />
                <p className="text-[10px] text-muted-foreground">
                  Minimum recovery between two matches for the same player.
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Scoring"
            description="Determines what the Live-page Finish dialog asks for and how the TV displays a final."
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, scoringFormat: 'simple' })}
                  className={`flex-1 px-3 py-2 text-sm rounded border ${
                    formData.scoringFormat === 'simple'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-muted/40'
                  }`}
                >
                  Simple score
                  <p className="text-[10px] opacity-70 mt-0.5">Just final score (e.g., 2-1)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, scoringFormat: 'badminton' })}
                  className={`flex-1 px-3 py-2 text-sm rounded border ${
                    formData.scoringFormat === 'badminton'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-muted/40'
                  }`}
                >
                  Badminton sets
                  <p className="text-[10px] opacity-70 mt-0.5">Set-by-set points (e.g., 21-19, 21-15)</p>
                </button>
              </div>

              {formData.scoringFormat === 'badminton' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Match format</Label>
                    <select
                      value={formData.setsToWin ?? 2}
                      onChange={(e) => setFormData({ ...formData, setsToWin: parseInt(e.target.value) })}
                      className="w-full h-9 px-2 rounded border border-input bg-background text-sm"
                    >
                      <option value={1}>Best of 1 (1 set)</option>
                      <option value={2}>Best of 3 (2 sets to win)</option>
                      <option value={3}>Best of 5 (3 sets to win)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Points per set</Label>
                    <select
                      value={formData.pointsPerSet ?? 21}
                      onChange={(e) => setFormData({ ...formData, pointsPerSet: parseInt(e.target.value) })}
                      className="w-full h-9 px-2 rounded border border-input bg-background text-sm"
                    >
                      <option value={11}>11 points (short)</option>
                      <option value={15}>15 points (medium)</option>
                      <option value={21}>21 points (standard)</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="deuceEnabled"
                      checked={formData.deuceEnabled ?? true}
                      onChange={(e) => setFormData({ ...formData, deuceEnabled: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <div>
                      <Label htmlFor="deuceEnabled" className="cursor-pointer">
                        Deuce (win by 2)
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        {formData.pointsPerSet === 21
                          ? 'After 20-20, first to 2-point lead wins (max 30 points).'
                          : `After ${(formData.pointsPerSet ?? 21) - 1}-${(formData.pointsPerSet ?? 21) - 1}, first to 2-point lead wins.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Events"
            description="Positions per school — e.g., 3 creates MS1, MS2, MS3."
          >
            <div className="grid grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label htmlFor="ms" className="text-xs">Men's singles</Label>
                <Input
                  id="ms"
                  type="number"
                  value={formData.rankCounts?.['MS'] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rankCounts: { ...formData.rankCounts, MS: parseInt(e.target.value) || 0 }
                  })}
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ws" className="text-xs">Women's singles</Label>
                <Input
                  id="ws"
                  type="number"
                  value={formData.rankCounts?.['WS'] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rankCounts: { ...formData.rankCounts, WS: parseInt(e.target.value) || 0 }
                  })}
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="md" className="text-xs">Men's doubles</Label>
                <Input
                  id="md"
                  type="number"
                  value={formData.rankCounts?.['MD'] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rankCounts: { ...formData.rankCounts, MD: parseInt(e.target.value) || 0 }
                  })}
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wd" className="text-xs">Women's doubles</Label>
                <Input
                  id="wd"
                  type="number"
                  value={formData.rankCounts?.['WD'] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rankCounts: { ...formData.rankCounts, WD: parseInt(e.target.value) || 0 }
                  })}
                  min={0}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xd" className="text-xs">Mixed doubles</Label>
                <Input
                  id="xd"
                  type="number"
                  value={formData.rankCounts?.['XD'] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    rankCounts: { ...formData.rankCounts, XD: parseInt(e.target.value) || 0 }
                  })}
                  min={0}
                  className="h-9"
                />
              </div>
            </div>
          </Section>
        </Surface>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="submit" disabled={saving} size="default">
            {saving ? 'Saving…' : 'Save configuration'}
          </Button>
        </div>
      </form>
      <SetupGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
