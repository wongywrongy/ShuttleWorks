/**
 * Engine settings — solver tuning + reproducibility.
 *
 * Lives in its own Setup section so tournament-shape config
 * (schedule, players, events) and engine-shape config (solver
 * knobs) don't compete for space in one giant form. Reads and
 * writes the same ``TournamentConfig`` as the Tournament form;
 * the four engine fields are persisted alongside everything else.
 *
 * Fields:
 *   - Reproducible run + seed (deterministic mode)
 *   - Solver time limit (5-120 s)
 *   - Candidate alternatives (1-20)
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useTournament } from '../../hooks/useTournament';
import type { TournamentConfig } from '../../api/dto';

interface EngineFormState {
  // Solver behaviour
  deterministic: boolean;
  randomSeed: number;
  solverTimeLimitSeconds: number;
  candidatePoolSize: number;
  // Optimisation goals (objective weights + opt-in soft constraints)
  enableCourtUtilization: boolean;
  courtUtilizationPenalty: number;
  enableGameProximity: boolean;
  minGameSpacingSlots: number | null;
  maxGameSpacingSlots: number | null;
  gameProximityPenalty: number;
  enableCompactSchedule: boolean;
  compactScheduleMode: 'minimize_makespan' | 'no_gaps' | 'finish_by_time';
  compactSchedulePenalty: number;
  targetFinishSlot: number | null;
  allowPlayerOverlap: boolean;
  playerOverlapPenalty: number;
}

const DEFAULTS: EngineFormState = {
  deterministic: false,
  randomSeed: 42,
  solverTimeLimitSeconds: 30,
  candidatePoolSize: 5,
  enableCourtUtilization: true,
  courtUtilizationPenalty: 50,
  enableGameProximity: false,
  minGameSpacingSlots: null,
  maxGameSpacingSlots: null,
  gameProximityPenalty: 5,
  enableCompactSchedule: false,
  compactScheduleMode: 'minimize_makespan',
  compactSchedulePenalty: 100,
  targetFinishSlot: null,
  allowPlayerOverlap: false,
  playerOverlapPenalty: 50,
};

function formStateFromConfig(config: TournamentConfig | null): EngineFormState {
  if (!config) return DEFAULTS;
  return {
    deterministic: config.deterministic ?? DEFAULTS.deterministic,
    randomSeed: config.randomSeed ?? DEFAULTS.randomSeed,
    solverTimeLimitSeconds: config.solverTimeLimitSeconds ?? DEFAULTS.solverTimeLimitSeconds,
    candidatePoolSize: config.candidatePoolSize ?? DEFAULTS.candidatePoolSize,
    enableCourtUtilization: config.enableCourtUtilization ?? DEFAULTS.enableCourtUtilization,
    courtUtilizationPenalty: config.courtUtilizationPenalty ?? DEFAULTS.courtUtilizationPenalty,
    enableGameProximity: config.enableGameProximity ?? DEFAULTS.enableGameProximity,
    minGameSpacingSlots: config.minGameSpacingSlots ?? null,
    maxGameSpacingSlots: config.maxGameSpacingSlots ?? null,
    gameProximityPenalty: config.gameProximityPenalty ?? DEFAULTS.gameProximityPenalty,
    enableCompactSchedule: config.enableCompactSchedule ?? DEFAULTS.enableCompactSchedule,
    compactScheduleMode: config.compactScheduleMode ?? DEFAULTS.compactScheduleMode,
    compactSchedulePenalty: config.compactSchedulePenalty ?? DEFAULTS.compactSchedulePenalty,
    targetFinishSlot: config.targetFinishSlot ?? null,
    allowPlayerOverlap: config.allowPlayerOverlap ?? DEFAULTS.allowPlayerOverlap,
    playerOverlapPenalty: config.playerOverlapPenalty ?? DEFAULTS.playerOverlapPenalty,
  };
}

export function EngineSettings() {
  const { config, updateConfig } = useTournament();
  const { confirmUnlock } = useLockGuard();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<EngineFormState>(() => formStateFromConfig(config));

  // Adopt incoming config changes that originated outside this pane
  // (e.g. the tournament form saved). Wholesale replace — keeping
  // partial drift logic across 16 fields is more bug-surface than
  // it's worth. A user editing this pane while another tab saves is
  // a corner case; if it bites we'll revisit.
  useEffect(() => {
    if (!config) return;
    setForm(formStateFromConfig(config));
  }, [config]);

  if (!config) {
    return (
      <div className="text-xs text-muted-foreground">
        Save the tournament config first — engine settings persist alongside it.
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmUnlock()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next: TournamentConfig = {
        ...config,
        deterministic: form.deterministic,
        randomSeed: form.randomSeed,
        solverTimeLimitSeconds: form.solverTimeLimitSeconds,
        candidatePoolSize: form.candidatePoolSize,
        enableCourtUtilization: form.enableCourtUtilization,
        courtUtilizationPenalty: form.courtUtilizationPenalty,
        enableGameProximity: form.enableGameProximity,
        minGameSpacingSlots: form.minGameSpacingSlots,
        maxGameSpacingSlots: form.maxGameSpacingSlots,
        gameProximityPenalty: form.gameProximityPenalty,
        enableCompactSchedule: form.enableCompactSchedule,
        compactScheduleMode: form.compactScheduleMode,
        compactSchedulePenalty: form.compactSchedulePenalty,
        targetFinishSlot: form.targetFinishSlot,
        allowPlayerOverlap: form.allowPlayerOverlap,
        playerOverlapPenalty: form.playerOverlapPenalty,
      };
      await updateConfig(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save engine settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Solver behaviour</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            How the CP-SAT engine searches for a schedule. Defaults work well for typical tournaments; tune up the time limit when you need a tighter solution.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Reproducible run */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
            <input
              type="checkbox"
              id="deterministic"
              checked={form.deterministic}
              onChange={(e) => setForm({ ...form, deterministic: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="deterministic" className="cursor-pointer">
                Reproducible run
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Single-worker mode with a fixed seed — same input always produces the same schedule. ~3× slower than parallel mode.
              </p>
              {form.deterministic && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs">Seed</Label>
                  <Input
                    type="number"
                    value={form.randomSeed}
                    onChange={(e) => setForm({ ...form, randomSeed: parseInt(e.target.value || '42', 10) })}
                    className="h-8 w-24"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Solver time limit */}
          <div className="p-3 bg-muted/50 rounded-md">
            <Label htmlFor="solverTimeLimitSeconds">Solver time limit</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Maximum wall-clock seconds the solver may spend. Higher = closer to optimal at the cost of operator wait time.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                id="solverTimeLimitSeconds"
                value={form.solverTimeLimitSeconds}
                onChange={(e) => setForm({ ...form, solverTimeLimitSeconds: parseInt(e.target.value, 10) })}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                min={5}
                max={120}
                step={5}
              />
              <span className="text-xs font-medium w-12 tabular-nums text-right">
                {form.solverTimeLimitSeconds}s
              </span>
            </div>
          </div>

          {/* Candidate pool size */}
          <div className="p-3 bg-muted/50 rounded-md">
            <Label htmlFor="candidatePoolSize">Candidate alternatives</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Top-N near-optimal alternative schedules to keep alongside the chosen one. Operator can swap to one in a click during play — no re-solve needed.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                id="candidatePoolSize"
                value={form.candidatePoolSize}
                onChange={(e) => setForm({ ...form, candidatePoolSize: parseInt(e.target.value, 10) })}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                min={1}
                max={20}
                step={1}
              />
              <span className="text-xs font-medium w-8 tabular-nums text-right">
                {form.candidatePoolSize}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Optimisation goals</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            What the solver tries to optimise alongside feasibility. Each toggle adds a soft penalty to the objective; the slider controls how strongly the solver chases that goal.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {/* Court Utilization */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
            <input
              type="checkbox"
              id="enableCourtUtilization"
              checked={form.enableCourtUtilization}
              onChange={(e) => setForm({ ...form, enableCourtUtilization: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="enableCourtUtilization" className="cursor-pointer">
                Maximise court utilisation
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Penalise idle courts. Higher = fewer empty courts, tighter schedule.
              </p>
              {form.enableCourtUtilization && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">0=off</span>
                  <input
                    type="range"
                    value={form.courtUtilizationPenalty}
                    onChange={(e) => setForm({ ...form, courtUtilizationPenalty: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                    min={0}
                    max={100}
                    step={10}
                  />
                  <span className="text-xs font-medium w-8 tabular-nums text-right">{form.courtUtilizationPenalty}</span>
                </div>
              )}
            </div>
          </div>

          {/* Game Spacing */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
            <input
              type="checkbox"
              id="enableGameProximity"
              checked={form.enableGameProximity}
              onChange={(e) => setForm({ ...form, enableGameProximity: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="enableGameProximity" className="cursor-pointer">
                Game spacing
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control time between a player's matches. Higher penalty = stricter enforcement.
              </p>
              {form.enableGameProximity && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Min slots between</Label>
                      <Input
                        type="number"
                        value={form.minGameSpacingSlots ?? ''}
                        onChange={(e) => setForm({ ...form, minGameSpacingSlots: e.target.value ? parseInt(e.target.value, 10) : null })}
                        min={0}
                        placeholder="e.g., 2"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max slots between</Label>
                      <Input
                        type="number"
                        value={form.maxGameSpacingSlots ?? ''}
                        onChange={(e) => setForm({ ...form, maxGameSpacingSlots: e.target.value ? parseInt(e.target.value, 10) : null })}
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
                      value={form.gameProximityPenalty}
                      onChange={(e) => setForm({ ...form, gameProximityPenalty: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                      min={0}
                      max={20}
                      step={1}
                    />
                    <span className="text-xs font-medium w-6 tabular-nums text-right">{form.gameProximityPenalty}</span>
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
              checked={form.enableCompactSchedule}
              onChange={(e) => setForm({ ...form, enableCompactSchedule: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="enableCompactSchedule" className="cursor-pointer">
                Compact schedule
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pack matches tightly. Higher weight = stronger enforcement (may soften other goals).
              </p>
              {form.enableCompactSchedule && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    {(['minimize_makespan', 'no_gaps', 'finish_by_time'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm({ ...form, compactScheduleMode: mode })}
                        className={`px-2 py-1 text-xs rounded ${
                          form.compactScheduleMode === mode
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {mode === 'minimize_makespan' ? 'Finish Early' : mode === 'no_gaps' ? 'No Gaps' : 'Finish By'}
                      </button>
                    ))}
                  </div>
                  {form.compactScheduleMode === 'finish_by_time' && (
                    <div>
                      <Label className="text-xs">Target finish slot</Label>
                      <Input
                        type="number"
                        value={form.targetFinishSlot ?? ''}
                        onChange={(e) => setForm({ ...form, targetFinishSlot: e.target.value ? parseInt(e.target.value, 10) : null })}
                        min={1}
                        placeholder="e.g., 10"
                        className="h-8"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">0=off</span>
                    <input
                      type="range"
                      value={form.compactSchedulePenalty}
                      onChange={(e) => setForm({ ...form, compactSchedulePenalty: parseFloat(e.target.value) })}
                      className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                      min={0}
                      max={200}
                      step={10}
                    />
                    <span className="text-xs font-medium w-8 tabular-nums text-right">{form.compactSchedulePenalty}</span>
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
              checked={form.allowPlayerOverlap}
              onChange={(e) => setForm({ ...form, allowPlayerOverlap: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div className="flex-1">
              <Label htmlFor="allowPlayerOverlap" className="cursor-pointer">
                Allow player overlap
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permit a player in two matches at once (soft constraint). Higher penalty = stronger avoidance.
              </p>
              {form.allowPlayerOverlap && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">0=allow freely</span>
                  <input
                    type="range"
                    value={form.playerOverlapPenalty}
                    onChange={(e) => setForm({ ...form, playerOverlapPenalty: parseFloat(e.target.value) })}
                    className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                    min={0}
                    max={100}
                    step={10}
                  />
                  <span className="text-xs font-medium w-8 tabular-nums text-right">{form.playerOverlapPenalty}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={`${INTERACTIVE_BASE} rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground`}
        >
          {saving ? 'Saving…' : 'Save engine settings'}
        </button>
        {saved && (
          <span className="text-xs text-green-700 dark:text-green-300">Saved.</span>
        )}
        {error && (
          <span className="text-xs text-red-700 dark:text-red-300">{error}</span>
        )}
      </div>
    </form>
  );
}
