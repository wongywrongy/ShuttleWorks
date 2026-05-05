/**
 * Engine settings — solver tuning + reproducibility + live-ops knobs.
 *
 * Reads and writes the same ``TournamentConfig`` as the Tournament
 * form; engine-shaped fields are persisted alongside everything else,
 * but only edited from this pane. The two forms intentionally have
 * separate save buttons.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useTournament } from '../../hooks/useTournament';
import type { TournamentConfig } from '../../api/dto';
import { Surface, Section } from './SettingsPrimitives';

interface EngineFormState {
  // Solver behaviour
  deterministic: boolean;
  randomSeed: number;
  solverTimeLimitSeconds: number;
  candidatePoolSize: number;
  // Live operations
  freezeHorizonSlots: number;
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
  freezeHorizonSlots: 0,
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

const COMPACT_MODE_HINTS: Record<EngineFormState['compactScheduleMode'], string> = {
  minimize_makespan:
    'Push the last match as early in the day as possible. Good when finishing fast matters more than a tidy middle.',
  no_gaps:
    'Penalise empty slots between matches on the same court. Good for venues that want courts running back-to-back.',
  finish_by_time:
    'Aim to wrap up by a specific slot — set the target below. Good when you have a hard cut-off (e.g. venue closes at 18:00).',
};

function formStateFromConfig(config: TournamentConfig | null): EngineFormState {
  if (!config) return DEFAULTS;
  return {
    deterministic: config.deterministic ?? DEFAULTS.deterministic,
    randomSeed: config.randomSeed ?? DEFAULTS.randomSeed,
    solverTimeLimitSeconds: config.solverTimeLimitSeconds ?? DEFAULTS.solverTimeLimitSeconds,
    candidatePoolSize: config.candidatePoolSize ?? DEFAULTS.candidatePoolSize,
    freezeHorizonSlots: config.freezeHorizonSlots ?? DEFAULTS.freezeHorizonSlots,
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
  // partial drift logic across 17 fields is more bug-surface than
  // it's worth.
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
    if (!(await confirmUnlock())) return;
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
        freezeHorizonSlots: form.freezeHorizonSlots,
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
    <form onSubmit={onSubmit} className="space-y-4">
      <Surface>
        <Section
          title="Solver"
          description="How the CP-SAT engine searches for a schedule. Defaults work well for typical tournaments; raise the time limit when you need a tighter solution."
        >
          <Toggle
            id="deterministic"
            label="Reproducible run"
            checked={form.deterministic}
            onChange={(v) => setForm({ ...form, deterministic: v })}
            hint="Single-worker mode with a fixed seed — same input always produces the same schedule. ~3× slower than parallel mode."
          >
            {form.deterministic && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs">Seed</Label>
                <Input
                  type="number"
                  value={form.randomSeed}
                  onChange={(e) =>
                    setForm({ ...form, randomSeed: parseInt(e.target.value || '42', 10) })
                  }
                  className="h-8 w-24"
                />
              </div>
            )}
          </Toggle>

          <Slider
            id="solverTimeLimitSeconds"
            label="Solver time limit"
            hint="Maximum wall-clock seconds the solver may spend. Higher = closer to optimal, at the cost of operator wait time."
            value={form.solverTimeLimitSeconds}
            onChange={(v) => setForm({ ...form, solverTimeLimitSeconds: v })}
            min={5}
            max={120}
            step={5}
            format={(v) => `${v}s`}
          />

          <Slider
            id="candidatePoolSize"
            label="Candidate alternatives"
            hint="Backup schedules to keep alongside the chosen one. Operator can swap to one mid-tournament without re-running the solver."
            value={form.candidatePoolSize}
            onChange={(v) => setForm({ ...form, candidatePoolSize: v })}
            min={1}
            max={20}
            step={1}
          />
        </Section>

        <Section
          title="Live operations"
          description="Knobs that control how the engine behaves while a tournament is running, not how it builds the initial schedule."
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="freezeHorizonSlots" className="text-xs">
                Freeze horizon (slots)
              </Label>
              <Input
                id="freezeHorizonSlots"
                type="number"
                value={form.freezeHorizonSlots}
                onChange={(e) =>
                  setForm({
                    ...form,
                    freezeHorizonSlots: parseInt(e.target.value || '0', 10),
                  })
                }
                min={0}
                max={10}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Slots starting from "now" that re-plans and repairs are not allowed to touch.
                Set to 2–3 to protect roughly the next hour of in-flight matches during play.
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Optimisation goals"
          description="What the solver tries to optimise alongside feasibility. Each toggle adds a soft penalty to the objective; the slider controls how strongly the solver chases that goal."
        >
          <Toggle
            id="enableCourtUtilization"
            label="Maximise court utilisation"
            hint="Penalise idle courts. Higher = fewer empty courts, tighter schedule."
            checked={form.enableCourtUtilization}
            onChange={(v) => setForm({ ...form, enableCourtUtilization: v })}
          >
            {form.enableCourtUtilization && (
              <div className="mt-2">
                <Slider
                  inline
                  label=""
                  value={form.courtUtilizationPenalty}
                  onChange={(v) => setForm({ ...form, courtUtilizationPenalty: v })}
                  min={0}
                  max={100}
                  step={10}
                  trailingHint="0 = off"
                />
              </div>
            )}
          </Toggle>

          <Toggle
            id="enableGameProximity"
            label="Game spacing"
            hint="Control how many slots between a player's matches. Higher penalty = stricter enforcement."
            checked={form.enableGameProximity}
            onChange={(v) => setForm({ ...form, enableGameProximity: v })}
          >
            {form.enableGameProximity && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Min slots between</Label>
                    <Input
                      type="number"
                      value={form.minGameSpacingSlots ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          minGameSpacingSlots: e.target.value
                            ? parseInt(e.target.value, 10)
                            : null,
                        })
                      }
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
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxGameSpacingSlots: e.target.value
                            ? parseInt(e.target.value, 10)
                            : null,
                        })
                      }
                      min={0}
                      placeholder="e.g., 6"
                      className="h-8"
                    />
                  </div>
                </div>
                <Slider
                  inline
                  label=""
                  value={form.gameProximityPenalty}
                  onChange={(v) => setForm({ ...form, gameProximityPenalty: v })}
                  min={0}
                  max={20}
                  step={1}
                  trailingHint="0 = off"
                />
              </div>
            )}
          </Toggle>

          <Toggle
            id="enableCompactSchedule"
            label="Compact schedule"
            hint="Pack matches tightly. Higher weight = stronger enforcement (may soften other goals)."
            checked={form.enableCompactSchedule}
            onChange={(v) => setForm({ ...form, enableCompactSchedule: v })}
          >
            {form.enableCompactSchedule && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {(['minimize_makespan', 'no_gaps', 'finish_by_time'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, compactScheduleMode: mode })}
                      className={`${INTERACTIVE_BASE} rounded px-2 py-1 text-xs font-medium ${
                        form.compactScheduleMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {mode === 'minimize_makespan'
                        ? 'Finish early'
                        : mode === 'no_gaps'
                          ? 'No gaps'
                          : 'Finish by'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {COMPACT_MODE_HINTS[form.compactScheduleMode]}
                </p>
                {form.compactScheduleMode === 'finish_by_time' && (
                  <div>
                    <Label className="text-xs">Target finish slot</Label>
                    <Input
                      type="number"
                      value={form.targetFinishSlot ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          targetFinishSlot: e.target.value
                            ? parseInt(e.target.value, 10)
                            : null,
                        })
                      }
                      min={1}
                      placeholder="e.g., 10"
                      className="h-8"
                    />
                  </div>
                )}
                <Slider
                  inline
                  label=""
                  value={form.compactSchedulePenalty}
                  onChange={(v) => setForm({ ...form, compactSchedulePenalty: v })}
                  min={0}
                  max={200}
                  step={10}
                  trailingHint="0 = off"
                />
              </div>
            )}
          </Toggle>

          <Toggle
            id="allowPlayerOverlap"
            label="Allow player overlap"
            hint="Permit a player in two matches at once (soft constraint). Higher penalty = stronger avoidance."
            checked={form.allowPlayerOverlap}
            onChange={(v) => setForm({ ...form, allowPlayerOverlap: v })}
          >
            {form.allowPlayerOverlap && (
              <div className="mt-2">
                <Slider
                  inline
                  label=""
                  value={form.playerOverlapPenalty}
                  onChange={(v) => setForm({ ...form, playerOverlapPenalty: v })}
                  min={0}
                  max={100}
                  step={10}
                  trailingHint="0 = allow freely"
                />
              </div>
            )}
          </Toggle>
        </Section>
      </Surface>

      <div className="flex items-center gap-3 pt-1">
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

// ── Local primitives ──────────────────────────────────────────────
//
// Toggle and Slider are pane-local because their layout (checkbox +
// label/hint, then inline child controls below) is specific to this
// pane's flow. Surface/Section/Field in SettingsPrimitives cover the
// outer scaffolding that's shared across panes.

interface ToggleProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}

function Toggle({ id, label, hint, checked, onChange, children }: ToggleProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <div className="flex-1">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {hint && (
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        )}
        {children}
      </div>
    </div>
  );
}

interface SliderProps {
  id?: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  /** Render only the slider row (no label/hint block above). */
  inline?: boolean;
  /** Small text shown to the left of the slider — e.g. "0 = off". */
  trailingHint?: string;
}

function Slider({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format,
  inline,
  trailingHint,
}: SliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className={inline ? '' : 'space-y-1'}>
      {!inline && (
        <>
          <Label htmlFor={id}>{label}</Label>
          {hint && (
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">{hint}</p>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        {trailingHint && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {trailingHint}
          </span>
        )}
        <input
          type="range"
          id={id}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
          min={min}
          max={max}
          step={step}
        />
        <span className="text-xs font-medium w-12 tabular-nums text-right">
          {display}
        </span>
      </div>
    </div>
  );
}
