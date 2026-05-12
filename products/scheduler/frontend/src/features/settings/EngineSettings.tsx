/**
 * EngineSettings — section 02 (Engine) of the Setup tab.
 *
 * Solver + live-operations + optimisation knobs. Each field is a Row
 * from features/settings/SettingsControls. Reads the live config from
 * useTournament(); maintains local form state with a dirty-check
 * so an autosave from another tab can't clobber in-flight edits.
 *
 * Save button only writes the fields this pane owns. Fields it doesn't
 * touch (tournament identity, public-display, etc.) flow through
 * `formData` unchanged so saving here doesn't reset them.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig } from '../../api/dto';
import { useTournament } from '../../hooks/useTournament';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useSuccessFlash } from '../../hooks/useSuccessFlash';
import { Button } from '@/components/ui/button';
import { IconDone } from '@scheduler/design-system';
import {
  Row,
  SectionHeader,
  Toggle,
  NumberWithSuffix,
  RangeSlider,
} from './SettingsControls';

export function EngineSettings() {
  const { config, updateConfig } = useTournament();
  const { confirmUnlock } = useLockGuard();
  const [formData, setFormData] = useState<Partial<TournamentConfig>>(() =>
    initialEngineState(config)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const justSaved = useSuccessFlash(saving);

  const baselineRef = useRef<TournamentConfig | null>(config);

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
    baselineRef.current = config;
  }, [config]);

  function set<K extends keyof TournamentConfig>(
    key: K,
    value: TournamentConfig[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    if (!(await confirmUnlock())) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateConfig({ ...config, ...formData });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <SectionHeader>Solver</SectionHeader>
      <div className="relative grid grid-cols-1 md:grid-cols-2 md:gap-x-12 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:-translate-x-1/2 md:before:w-px md:before:bg-border/60">
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
      </div>

      <SectionHeader>Live operations</SectionHeader>
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
      />
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

      {saveError && (
        <div className="motion-enter mt-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
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
    </form>
  );
}

function initialEngineState(
  config: TournamentConfig | null
): Partial<TournamentConfig> {
  return {
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
