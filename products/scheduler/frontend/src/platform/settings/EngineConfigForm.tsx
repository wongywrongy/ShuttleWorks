/**
 * EngineConfigForm — the shared "Engine" configuration surface rendered by
 * both the Meet and Bracket modules.
 *
 * Both modules write the SAME TournamentConfig blob and drive the same
 * CP-SAT engine, so Scoring / Timing / Advanced solver / Optimisation goals
 * render identically for both — the one declared exception is Bracket's
 * "Rest between rounds" knob (see ENGINE_CONFIG_FIELDS `modules`).
 *
 * Reads the live config from useTournament(); maintains local form state
 * with a dirty-check so an autosave from another tab can't clobber
 * in-flight edits. Save spreads the full config so it only writes the
 * fields this pane owns and leaves the rest of the config untouched.
 *
 * This component lives in platform/ and must stay module-agnostic: the
 * schedule-lock guard is consumed via the `guardSave` prop rather than a
 * direct `useLockGuard` import, so platform/ never depends on a
 * product-owned store.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { useTournament } from '../../hooks/useTournament';
import { useTournamentId } from '../../hooks/useTournamentId';
import { useSuccessFlash } from '../../hooks/useSuccessFlash';
import { Button, IconDone } from '@scheduler/design-system';
import {
  Row,
  SectionHeader,
  Toggle,
  NumberWithSuffix,
  RangeSlider,
  TimeInput,
} from './SettingsControls';
import { ScoringFields, type ScoringValue } from './ScoringFields';

/** The modules that render this form. Both drive the same CP-SAT engine. */
export type EngineModule = 'meet' | 'bracket';

export interface EngineConfigFormProps {
  module: EngineModule;
  /** When set, the form carries this id so the page actions-bar Save can
   *  submit it via `form=`, and the in-form Save button is hidden. */
  formId?: string;
  /** Reports save in-flight state up so the external Save button can show
   *  Saving…/Saved without duplicating this pane's submit logic. */
  onBusyChange?: (busy: boolean) => void;
  /** Resolves false to abort the save (lock guard). Defaults to allow. */
  guardSave?: () => Promise<boolean>;
}

export const ENGINE_CONFIG_FIELDS = [
  { key: 'scoringFormat', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'pointsPerSet', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'setsToWin', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'deuceEnabled', group: 'scoring', modules: ['meet', 'bracket'] },
  { key: 'defaultRestMinutes', group: 'timing', modules: ['meet', 'bracket'] },
  { key: 'breaks', group: 'timing', modules: ['meet', 'bracket'] },
  { key: 'restBetweenRounds', group: 'timing', modules: ['bracket'] },
  { key: 'deterministic', group: 'solver', modules: ['meet', 'bracket'] },
  // Meet-only: C10's `_bracket_solver_options` (backend/api/brackets.py)
  // deliberately does NOT read `solverTimeLimitSeconds` — bracket keeps
  // its own per-request budget. Rendering the control on bracket would be
  // decorative (it changes nothing), so the schema — and the gated render
  // below — restrict it to meet.
  { key: 'solverTimeLimitSeconds', group: 'solver', modules: ['meet'] },
  { key: 'freezeHorizonSlots', group: 'solver', modules: ['meet', 'bracket'] },
  { key: 'enableCourtUtilization', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'courtUtilizationPenalty', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'enableGameProximity', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'enableCompactSchedule', group: 'goals', modules: ['meet', 'bracket'] },
  { key: 'allowPlayerOverlap', group: 'goals', modules: ['meet', 'bracket'] },
] as const satisfies ReadonlyArray<{
  key: keyof TournamentConfig;
  group: 'scoring' | 'timing' | 'solver' | 'goals';
  modules: ReadonlyArray<EngineModule>;
}>;

/**
 * Does this field apply to this module? The schema is the single place a
 * module-specific knob is declared, so a divergence between the two Engine
 * tabs has to be written down here — it can't creep in by hand.
 */
export function engineFieldAppliesTo(
  key: keyof TournamentConfig,
  module: EngineModule,
): boolean {
  const field = ENGINE_CONFIG_FIELDS.find((f) => f.key === key);
  return (
    field !== undefined &&
    (field.modules as ReadonlyArray<EngineModule>).includes(module)
  );
}

export function EngineConfigForm({
  module,
  formId,
  onBusyChange,
  guardSave,
}: EngineConfigFormProps) {
  const { config, updateConfig } = useTournament();
  const tid = useTournamentId();
  const [formData, setFormData] = useState<Partial<TournamentConfig>>(() =>
    initialEngineState(config)
  );
  const [breakWindows, setBreakWindows] = useState<BreakWindow[]>(
    config?.breaks ?? []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const justSaved = useSuccessFlash(saving);

  const baselineRef = useRef<TournamentConfig | null>(config);
  const breakBaselineRef = useRef<BreakWindow[]>(config?.breaks ?? []);

  // Dirty-check: adopt new server values only for fields the user
  // hasn't touched since the last accepted baseline.
  useEffect(() => {
    if (!config) return;
    setFormData((prev) => {
      const merged: Partial<TournamentConfig> = { ...prev };
      const prevBaseline = baselineRef.current ?? config;
      (Object.keys(initialEngineState(config)) as Array<keyof TournamentConfig>).forEach(
        (key) => {
          const userTouched =
            JSON.stringify(prev[key]) !== JSON.stringify(prevBaseline[key]);
          if (!userTouched) {
            (merged as Record<string, unknown>)[key] = config[key];
          }
        }
      );
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

  function set<K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  const scoring: ScoringValue = {
    scoringFormat: formData.scoringFormat ?? 'badminton',
    pointsPerSet: formData.pointsPerSet ?? 21,
    setsToWin: formData.setsToWin ?? 2,
    deuceEnabled: formData.deuceEnabled ?? true,
  };

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    if (guardSave && !(await guardSave())) return;
    setSaving(true);
    onBusyChange?.(true);
    setSaveError(null);
    try {
      const cleanedBreaks = breakWindows.filter((bw) => bw.start || bw.end);
      await updateConfig({ ...config, ...formData, breaks: cleanedBreaks });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 items-start">
        {/* Left column — Scoring + Timing (the operator-facing inputs). */}
        <div className="lg:col-span-1 space-y-2">
          <section>
            <SectionHeader>Scoring</SectionHeader>
            <ScoringFields
              value={scoring}
              onChange={(patch) =>
                setFormData((prev) => ({ ...prev, ...patch }))
              }
            />
          </section>

          <section>
            <SectionHeader>Timing</SectionHeader>
            <p className="pb-1 text-xs text-muted-foreground">
              Courts, slot duration, and the day window live in{' '}
              <Link
                to={`/tournaments/${tid}/ws-venue`}
                className="text-accent hover:underline"
              >
                Venue &amp; schedule
              </Link>
              .
            </p>
            <Row
              label="Rest between matches"
              control={
                <NumberWithSuffix
                  value={formData.defaultRestMinutes ?? 30}
                  onChange={(v) => set('defaultRestMinutes', v)}
                  suffix="min"
                  min={0}
                  max={120}
                  ariaLabel="Rest between matches"
                />
              }
            />
            <Row
              label="Break (optional)"
              last={!engineFieldAppliesTo('restBetweenRounds', module)}
              control={
                breakStart || breakEnd ? (
                  <span className="inline-flex items-center gap-2">
                    <TimeInput value={breakStart} onChange={setBreakStart} ariaLabel="Break start" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <TimeInput value={breakEnd} onChange={setBreakEnd} ariaLabel="Break end" />
                    <button
                      type="button"
                      onClick={() => { setBreakStart(''); setBreakEnd(''); }}
                      className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast ease-brand"
                    >
                      Clear
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBreakStart('12:00')}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast ease-brand"
                  >
                    None — add break
                  </button>
                )
              }
            />
            {engineFieldAppliesTo('restBetweenRounds', module) ? (
              <Row
                label="Rest between rounds"
                control={
                  <NumberWithSuffix
                    value={formData.restBetweenRounds ?? 1}
                    onChange={(v) => set('restBetweenRounds', v)}
                    suffix="slots"
                    min={0}
                    max={32}
                    ariaLabel="Rest between rounds (slots)"
                  />
                }
                last
              />
            ) : null}
          </section>
        </div>

        {/* Right column — Advanced solver knobs (also CP-SAT inputs). */}
        <div className="lg:col-span-1 space-y-2">
          <section>
            <SectionHeader>Advanced solver</SectionHeader>
            <Row
              label="Reproducible run"
              control={
                <Toggle
                  value={formData.deterministic ?? false}
                  onChange={(v) => set('deterministic', v)}
                  ariaLabel="Reproducible solver run"
                />
              }
            />
            {engineFieldAppliesTo('solverTimeLimitSeconds', module) ? (
              <Row
                label="Solver time limit"
                control={
                  <NumberWithSuffix
                    value={formData.solverTimeLimitSeconds ?? 30}
                    onChange={(v) => set('solverTimeLimitSeconds', v)}
                    suffix="s"
                    min={1}
                    max={600}
                    ariaLabel="Solver wall-clock cap in seconds"
                  />
                }
              />
            ) : null}
            <Row
              label="Freeze horizon"
              control={
                <NumberWithSuffix
                  value={formData.freezeHorizonSlots ?? 0}
                  onChange={(v) => set('freezeHorizonSlots', v)}
                  suffix="slots"
                  min={0}
                  max={32}
                  ariaLabel="Freeze horizon in slots"
                />
              }
              last
            />
          </section>

          <section>
            <SectionHeader>Optimisation goals</SectionHeader>
            <Row
              label="Maximise court utilisation"
              control={
                <Toggle
                  value={formData.enableCourtUtilization ?? true}
                  onChange={(v) => set('enableCourtUtilization', v)}
                  ariaLabel="Maximise court utilisation"
                />
              }
            />
            {/* Weight applies only when court-utilisation optimisation is on —
                indented + disabled to read as dependent (the value still saves). */}
            <div
              className={[
                'mt-1 pl-4 border-l border-border/60',
                (formData.enableCourtUtilization ?? true) ? '' : 'opacity-50 pointer-events-none',
              ].join(' ')}
              aria-disabled={!(formData.enableCourtUtilization ?? true)}
            >
              <Row
                label="Court utilisation weight"
                control={
                  <RangeSlider
                    value={Math.round(formData.courtUtilizationPenalty ?? 50)}
                    onChange={(v) => set('courtUtilizationPenalty', v)}
                    min={0}
                    max={100}
                    ariaLabel="Court utilisation weight"
                  />
                }
                last
              />
            </div>
            <Row
              label="Game spacing"
              control={
                <Toggle
                  value={formData.enableGameProximity ?? false}
                  onChange={(v) => set('enableGameProximity', v)}
                  ariaLabel="Enforce game spacing"
                />
              }
            />
            <Row
              label="Compact schedule"
              control={
                <Toggle
                  value={formData.enableCompactSchedule ?? false}
                  onChange={(v) => set('enableCompactSchedule', v)}
                  ariaLabel="Compact schedule"
                />
              }
            />
            <Row
              label="Allow player overlap"
              control={
                <Toggle
                  value={formData.allowPlayerOverlap ?? false}
                  onChange={(v) => set('allowPlayerOverlap', v)}
                  ariaLabel="Allow player overlap"
                />
              }
              last
            />
          </section>
        </div>
      </div>

      {saveError && (
        <div className="motion-enter mt-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
      {/* In-form Save — hidden when the page actions-bar Save owns
          submission (formId set). */}
      {!formId ? (
        <div className="mt-6">
          <Button type="submit" disabled={saving || !config}>
            {justSaved ? (
              <span key="saved" className="motion-enter-icon inline-flex items-center gap-2">
                <IconDone size={16} /> Saved
              </span>
            ) : saving ? (
              'Saving…'
            ) : (
              'Save engine settings'
            )}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function initialEngineState(
  config: TournamentConfig | null
): Partial<TournamentConfig> {
  return {
    scoringFormat: config?.scoringFormat ?? 'badminton',
    pointsPerSet: config?.pointsPerSet ?? 21,
    setsToWin: config?.setsToWin ?? 2,
    deuceEnabled: config?.deuceEnabled ?? true,
    defaultRestMinutes: config?.defaultRestMinutes ?? 30,
    restBetweenRounds: config?.restBetweenRounds ?? 1,
    deterministic: config?.deterministic ?? false,
    solverTimeLimitSeconds: config?.solverTimeLimitSeconds ?? 30,
    freezeHorizonSlots: config?.freezeHorizonSlots ?? 0,
    enableCourtUtilization: config?.enableCourtUtilization ?? true,
    courtUtilizationPenalty: config?.courtUtilizationPenalty ?? 50,
    enableGameProximity: config?.enableGameProximity ?? false,
    enableCompactSchedule: config?.enableCompactSchedule ?? false,
    allowPlayerOverlap: config?.allowPlayerOverlap ?? false,
  };
}
