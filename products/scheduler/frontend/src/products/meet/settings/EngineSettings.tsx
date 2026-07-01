/**
 * EngineSettings — the "Engine" tab of Configuration.
 *
 * The CP-SAT input surface. Scoring (the field set shared with the
 * Bracket Engine tab) and timing (rest between matches + an optional
 * break) sit at the top; the solver / live-operations / optimisation
 * knobs — also CP-SAT inputs — live below under "Advanced solver".
 *
 * Reads the live config from useTournament(); maintains local form state
 * with a dirty-check so an autosave from another tab can't clobber
 * in-flight edits. Save spreads the full config so it only writes the
 * fields this pane owns and leaves the Meet tab's structure fields
 * (meet type, position counts) untouched.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { TournamentConfig, BreakWindow } from '../../../api/dto';
import { useTournament } from '../../../hooks/useTournament';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { useLockGuard } from '../../../hooks/useLockGuard';
import { useSuccessFlash } from '../../../hooks/useSuccessFlash';
import { Button, IconDone } from '@scheduler/design-system';
import {
  Row,
  SectionHeader,
  Toggle,
  NumberWithSuffix,
  RangeSlider,
  TimeInput,
} from '../../../platform/settings/SettingsControls';
import {
  ScoringFields,
  type ScoringValue,
} from '../../../platform/settings/ScoringFields';

export function EngineSettings({
  formId,
  onBusyChange,
}: {
  /** When set, the form carries this id so the page actions-bar Save can
   *  submit it via `form=`, and the in-form Save button is hidden. */
  formId?: string;
  /** Reports save in-flight state up so the external Save button can show
   *  Saving…/Saved without duplicating this pane's submit logic. */
  onBusyChange?: (busy: boolean) => void;
} = {}) {
  const { config, updateConfig } = useTournament();
  const { confirmUnlock } = useLockGuard();
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
    if (!(await confirmUnlock())) return;
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
              last
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
