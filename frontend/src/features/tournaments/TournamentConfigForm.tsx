import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { isValidTime } from '../../lib/time';
import { SetupGuide } from './SetupGuide';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Tournament Configuration</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowGuide(true)}>
            Setup Guide
          </Button>
        </div>

        {/* SCHEDULE & VENUE */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Schedule & Venue</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
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

            <Separator className="my-3" />

            {/* Breaks */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs">Breaks</Label>
                <Button type="button" variant="outline" size="sm" onClick={addBreak} className="h-7 text-xs">
                  + Add Break
                </Button>
              </div>
              {breakWindows.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {breakWindows.map((breakWindow, index) => (
                    <div key={index} className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                      <Input
                        type="time"
                        value={breakWindow.start}
                        onChange={(e) => updateBreak(index, 'start', e.target.value)}
                        className="h-7 w-24 text-xs"
                      />
                      <span className="text-muted-foreground text-xs">-</span>
                      <Input
                        type="time"
                        value={breakWindow.end}
                        onChange={(e) => updateBreak(index, 'end', e.target.value)}
                        className="h-7 w-24 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBreak(index)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No breaks configured</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PLAYER SETTINGS */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Player Settings</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="rest" className="text-xs">Rest Between Matches (min)</Label>
                <Input
                  id="rest"
                  type="number"
                  value={formData.defaultRestMinutes}
                  onChange={(e) => setFormData({ ...formData, defaultRestMinutes: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={180}
                  className={`h-9 ${errors.defaultRestMinutes ? 'border-destructive' : ''}`}
                />
                <p className="text-[10px] text-muted-foreground">Players can override in profile</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="freeze" className="text-xs">Freeze Horizon (slots)</Label>
                <Input
                  id="freeze"
                  type="number"
                  value={formData.freezeHorizonSlots}
                  onChange={(e) => setFormData({ ...formData, freezeHorizonSlots: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={10}
                  className={`h-9 ${errors.freezeHorizonSlots ? 'border-destructive' : ''}`}
                />
                <p className="text-[10px] text-muted-foreground">Slots protected from live rescheduling</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SCORING FORMAT */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Scoring Format</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="space-y-3">
              {/* Format selector */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, scoringFormat: 'simple' })}
                  className={`flex-1 px-3 py-2 text-sm rounded border ${
                    formData.scoringFormat === 'simple'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent'
                  }`}
                >
                  Simple Score
                  <p className="text-[10px] opacity-70 mt-0.5">Just final score (e.g., 2-1)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, scoringFormat: 'badminton' })}
                  className={`flex-1 px-3 py-2 text-sm rounded border ${
                    formData.scoringFormat === 'badminton'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent'
                  }`}
                >
                  Badminton Sets
                  <p className="text-[10px] opacity-70 mt-0.5">Set-by-set points (e.g., 21-19, 21-15)</p>
                </button>
              </div>

              {/* Badminton-specific settings */}
              {formData.scoringFormat === 'badminton' && (
                <div className="bg-muted/50 rounded-md p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Match Format</Label>
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
                      <Label className="text-xs">Points per Set</Label>
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
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="deuceEnabled"
                      checked={formData.deuceEnabled ?? true}
                      onChange={(e) => setFormData({ ...formData, deuceEnabled: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    <div>
                      <Label htmlFor="deuceEnabled" className="cursor-pointer">
                        Deuce (win by 2)
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        {formData.pointsPerSet === 21
                          ? 'After 20-20, first to 2-point lead wins (max 30 points)'
                          : `After ${(formData.pointsPerSet ?? 21) - 1}-${(formData.pointsPerSet ?? 21) - 1}, first to 2-point lead wins`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* EVENT CATEGORIES */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Event Categories</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">Positions per school (e.g., 3 creates MS1, MS2, MS3)</p>
            <div className="grid grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label htmlFor="ms" className="text-xs">Men's Singles</Label>
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
                <Label htmlFor="ws" className="text-xs">Women's Singles</Label>
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
                <Label htmlFor="md" className="text-xs">Men's Doubles</Label>
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
                <Label htmlFor="wd" className="text-xs">Women's Doubles</Label>
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
                <Label htmlFor="xd" className="text-xs">Mixed Doubles</Label>
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
          </CardContent>
        </Card>

        {/* ADVANCED OPTIMIZATION (Collapsible) */}
        <Card>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/50 rounded-t-lg"
          >
            <span className="text-sm font-medium">Advanced Optimization</span>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <CardContent className="px-4 pb-4 pt-0 border-t">
              <div className="space-y-3 pt-3">
                {/* Court Utilization */}
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                  <input
                    type="checkbox"
                    id="enableCourtUtilization"
                    checked={formData.enableCourtUtilization ?? true}
                    onChange={(e) => setFormData({ ...formData, enableCourtUtilization: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <div className="flex-1">
                    <Label htmlFor="enableCourtUtilization" className="cursor-pointer">
                      Maximize Court Utilization
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Penalize idle courts. Higher = fewer empty courts, tighter schedule
                    </p>

                    {formData.enableCourtUtilization && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">0=off</span>
                        <input
                          type="range"
                          value={formData.courtUtilizationPenalty ?? 50}
                          onChange={(e) => setFormData({ ...formData, courtUtilizationPenalty: parseFloat(e.target.value) })}
                          className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                          min="0"
                          max="100"
                          step="10"
                        />
                        <span className="text-xs font-medium w-8">{formData.courtUtilizationPenalty ?? 50}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Game Spacing */}
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                  <input
                    type="checkbox"
                    id="enableGameProximity"
                    checked={formData.enableGameProximity ?? false}
                    onChange={(e) => setFormData({ ...formData, enableGameProximity: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <div className="flex-1">
                    <Label htmlFor="enableGameProximity" className="cursor-pointer">
                      Game Spacing Constraint
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Control time between a player's matches. Higher penalty = stricter enforcement
                    </p>

                    {formData.enableGameProximity && (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Min slots between games</Label>
                            <Input
                              type="number"
                              value={formData.minGameSpacingSlots ?? ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                minGameSpacingSlots: e.target.value ? parseInt(e.target.value) : null
                              })}
                              min={0}
                              placeholder="e.g., 2"
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Max slots between games</Label>
                            <Input
                              type="number"
                              value={formData.maxGameSpacingSlots ?? ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                maxGameSpacingSlots: e.target.value ? parseInt(e.target.value) : null
                              })}
                              min={0}
                              placeholder="e.g., 6"
                              className="h-8"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">0=off</span>
                          <input
                            type="range"
                            value={formData.gameProximityPenalty ?? 5}
                            onChange={(e) => setFormData({ ...formData, gameProximityPenalty: parseFloat(e.target.value) })}
                            className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                            min="0"
                            max="20"
                            step="1"
                          />
                          <span className="text-xs font-medium w-6">{formData.gameProximityPenalty ?? 5}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Compact Schedule */}
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                  <input
                    type="checkbox"
                    id="enableCompactSchedule"
                    checked={formData.enableCompactSchedule ?? false}
                    onChange={(e) => setFormData({ ...formData, enableCompactSchedule: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <div className="flex-1">
                    <Label htmlFor="enableCompactSchedule" className="cursor-pointer">
                      Compact Schedule
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pack matches tightly. Higher weight = stronger enforcement (may soften other constraints)
                    </p>

                    {formData.enableCompactSchedule && (
                      <div className="mt-2 space-y-2">
                        {/* Mode selector */}
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, compactScheduleMode: 'minimize_makespan' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.compactScheduleMode === 'minimize_makespan'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            Finish Early
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, compactScheduleMode: 'no_gaps' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.compactScheduleMode === 'no_gaps'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            No Gaps
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, compactScheduleMode: 'finish_by_time' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.compactScheduleMode === 'finish_by_time'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            Finish By
                          </button>
                        </div>

                        {/* Target finish slot for finish_by_time mode */}
                        {formData.compactScheduleMode === 'finish_by_time' && (
                          <div>
                            <Label className="text-xs">Target finish slot</Label>
                            <Input
                              type="number"
                              value={formData.targetFinishSlot ?? ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                targetFinishSlot: e.target.value ? parseInt(e.target.value) : null
                              })}
                              min={1}
                              placeholder="e.g., 10"
                              className="h-8"
                            />
                          </div>
                        )}

                        {/* Weight slider */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">0=off</span>
                          <input
                            type="range"
                            value={formData.compactSchedulePenalty ?? 100}
                            onChange={(e) => setFormData({ ...formData, compactSchedulePenalty: parseFloat(e.target.value) })}
                            className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                            min="0"
                            max="200"
                            step="10"
                          />
                          <span className="text-xs font-medium w-8">{formData.compactSchedulePenalty ?? 100}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Allow Player Overlap */}
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                  <input
                    type="checkbox"
                    id="allowPlayerOverlap"
                    checked={formData.allowPlayerOverlap ?? false}
                    onChange={(e) => setFormData({ ...formData, allowPlayerOverlap: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <div className="flex-1">
                    <Label htmlFor="allowPlayerOverlap" className="cursor-pointer">
                      Allow Player Overlap
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Permit same player in multiple matches at once (soft constraint). Higher penalty = stronger avoidance
                    </p>

                    {formData.allowPlayerOverlap && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">0=allow freely</span>
                        <input
                          type="range"
                          value={formData.playerOverlapPenalty ?? 50}
                          onChange={(e) => setFormData({ ...formData, playerOverlapPenalty: parseFloat(e.target.value) })}
                          className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                          min="0"
                          max="100"
                          step="10"
                        />
                        <span className="text-xs font-medium w-8">{formData.playerOverlapPenalty ?? 50}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Submit row — right-aligned per enterprise dashboard convention.
         * Full-width primary CTAs read as marketing-page CTAs; this is a
         * config form. Sized to its content with comfortable padding. */}
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={saving} size="default">
            {saving ? 'Saving…' : 'Save configuration'}
          </Button>
        </div>
      </form>
      <SetupGuide isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
