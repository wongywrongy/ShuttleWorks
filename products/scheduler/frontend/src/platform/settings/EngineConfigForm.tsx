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
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { TournamentConfig, BreakWindow } from '../../api/dto';
import { useTournament } from '../../hooks/useTournament';
import { useSuccessFlash } from '../../hooks/useSuccessFlash';
import { Button, IconDone } from '@scheduler/design-system';
import {
  Row,
  Seg,
  Section,
  Toggle,
  NumberWithSuffix,
  RangeSlider,
  TimeInput,
} from './SettingsControls';
import { ScoringFields, type ScoringValue } from './ScoringFields';
import { MeetEventsSection, DEFAULT_RANKS } from './MeetEventsSection';

const MEET_TYPE_OPTIONS = [
  { value: 'dual' as const, label: 'Dual' },
  { value: 'tri' as const, label: 'Tri' },
];

/* The five disciplines used to be a hardcoded list right here, which made
   them look like a property of the product. They are the default seed for a
   new meet and nothing more — see MeetEventsSection. */

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
  /** Hard lock (e.g. a bracket draw in play): values are shown for review
   *  only — no save affordance renders and submit is a no-op. Pair with a
   *  `LockedFieldset` so the controls themselves are inert too. */
  readOnly?: boolean;
  /** Module-owned `Section`s rendered above Scoring, in the slot Meet's
   *  inline "Events" section occupies.
   *
   *  This is a SLOT, not an import, on purpose: the bracket's Events content
   *  reads `useBracket()` and lives in `products/bracket/`, and this form
   *  lives in `platform/` — which dependency-cruiser forbids from importing
   *  `products/`. Passing the node keeps the merged surface (one form, one
   *  save path) without inverting the layer.
   *
   *  Whatever is passed must NOT write `TournamentConfig`: this form's submit
   *  spreads the whole config, so a second writer on the same page is a
   *  silent clobber. The bracket's structure content is read-only. */
  leadingSections?: ReactNode;
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
  // Meet structure. These used to live in a separate `MeetStructureForm` on
  // an "Events" tab beside this one. Two forms on one page, each spreading
  // the WHOLE config on save, is a silent-clobber waiting to happen, so the
  // merge moved the fields into this form's single save path rather than
  // mounting both.
  { key: 'meetMode', group: 'structure', modules: ['meet'] },
  { key: 'rankCounts', group: 'structure', modules: ['meet'] },
] as const satisfies ReadonlyArray<{
  key: keyof TournamentConfig;
  group: 'scoring' | 'timing' | 'solver' | 'goals' | 'structure';
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
  readOnly = false,
  leadingSections,
}: EngineConfigFormProps) {
  const { config, updateConfig } = useTournament();
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
  //
  // FIRST LOAD IS NOT AN EDIT. `baselineRef` starts as whatever `config` was
  // at mount, which is `null` whenever the config resolves after the first
  // render — the normal case. This used to fall back to `config` as the
  // baseline in that situation, so every field whose stored value differed
  // from its default compared unequal, was read as "the user touched this",
  // and the server value was silently never adopted: the form showed
  // defaults over real saved settings, and saving wrote them back.
  //
  // Mostly invisible while the surface rendered a fixed five events with
  // per-field fallbacks. Not invisible once the event LIST itself comes from
  // config — a workspace with two events showed five and would have
  // overwritten its own set on the next save.
  useEffect(() => {
    if (!config) return;
    const baseline = baselineRef.current;
    setFormData((prev) => {
      const merged: Partial<TournamentConfig> = { ...prev };
      (Object.keys(initialEngineState(config)) as Array<keyof TournamentConfig>).forEach(
        (key) => {
          const userTouched =
            baseline !== null &&
            JSON.stringify(prev[key]) !== JSON.stringify(baseline[key]);
          if (!userTouched) {
            (merged as Record<string, unknown>)[key] = config[key];
          }
        }
      );
      return merged;
    });
    const breakUserTouched =
      baseline !== null &&
      JSON.stringify(breakWindows) !== JSON.stringify(breakBaselineRef.current);
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
    if (readOnly || !config) return;
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
      {/* SINGLE COLUMN, bounded width so every control lands on one rail.
          This was a 2-column grid: you read down Scoring/Timing on the left,
          then jumped back up to the right for the solver — an implied reading
          order nothing on the page stated, while Venue & schedule ran one
          column off these same primitives. Order is now operator-first:
          what the matches are, then when they run, then what the solver
          optimises for, with the solver's own internals last. */}
      <div className="max-w-3xl space-y-2">
          {/* The module's own sections lead — Meet's inline Events below,
              Bracket's via the `leadingSections` slot. Both engines put
              "what is being contested" above "how it is scored". */}
          {leadingSections}
          {module === 'meet' ? (
            <>
              {/* One section, not two. "Format" sat two sections above the
                  "Match format" row in Scoring: different things, near
                  identical names. Meet type is a single row, so it belongs
                  with what is being contested rather than owning a section
                  of its own. */}
              <Section title="Events">
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
                />
                <MeetEventsSection
                  rankCounts={formData.rankCounts ?? DEFAULT_RANKS}
                  onChange={(next) => set('rankCounts', next)}
                  readOnly={readOnly}
                />
              </Section>
            </>
          ) : null}

          <Section title="Scoring">
            <ScoringFields
              value={scoring}
              onChange={(patch) =>
                setFormData((prev) => ({ ...prev, ...patch }))
              }
            />
          </Section>

          <Section title="Timing">
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
                  /* A real control, not a sentence. This was bare muted text
                     ("None, add break"), so the one row on the form whose
                     control was a link read as body copy and the row looked
                     empty. The label already says the break is optional; the
                     control only has to name the action. */
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBreakStart('12:00')}
                  >
                    Add break
                  </Button>
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
          </Section>

          <Section title="Optimisation goals">
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
          </Section>

          {/* Solver internals last: a director changes these rarely, and
              never during an event. */}
          {/* The one collapsed group: solver internals a director
              changes rarely, and never during an event. */}
          <Section title="Advanced solver" defaultOpen={false}>
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
          </Section>
      </div>

      {saveError && (
        <div className="motion-enter mt-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
      {/* In-form Save — hidden when the page actions-bar Save owns
          submission (formId set) and under a hard lock (read-only review:
          a disabled Save would just beg the question the LockRibbon
          already answers). */}
      {!formId && !readOnly ? (
        <div className="mt-6">
          {/* xs (28px) — matches the meet's actions-bar Save so the shared
              Configuration archetype reads identically on both engines. */}
          <Button size="xs" type="submit" disabled={saving || !config}>
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
    meetMode: config?.meetMode ?? 'dual',
    rankCounts: config?.rankCounts ?? { ...DEFAULT_RANKS },
  };
}
