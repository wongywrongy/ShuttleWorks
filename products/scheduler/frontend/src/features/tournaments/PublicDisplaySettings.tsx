/**
 * PublicDisplaySettings — section 03 (Public display) of the Setup tab.
 *
 * Operator-facing TV configuration: layout mode + grid columns + card
 * size, brand (accent palette + theme + bg tone), content visibility.
 * Reads from the live tournament config via useAppStore; saves the
 * subset of fields this pane owns.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig } from '../../api/dto';
import { useAppStore } from '../../store/appStore';
import { useTournament } from '../../hooks/useTournament';
import { useLockGuard } from '../../hooks/useLockGuard';
import { useSuccessFlash } from '../../hooks/useSuccessFlash';
import { Button } from '@/components/ui/button';
import { IconDone } from '@scheduler/design-system';
import {
  Row,
  SectionHeader,
  Seg,
  Toggle,
  ColorSwatchRow,
} from '../settings/SettingsControls';

const DISPLAY_MODE_OPTIONS = [
  { value: 'strip' as const, label: 'Strip' },
  { value: 'grid'  as const, label: 'Grid'  },
  { value: 'list'  as const, label: 'List'  },
];

// Grid columns Seg — `0` is the sentinel for Auto (we round-trip
// through `null` on the wire).
const GRID_COLUMNS_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

const CARD_SIZE_OPTIONS = [
  { value: 'auto'        as const, label: 'Auto' },
  { value: 'compact'     as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'large'       as const, label: 'Large' },
];

const THEME_OPTIONS = [
  { value: 'auto'  as const, label: 'Auto'  },
  { value: 'dark'  as const, label: 'Dark'  },
  { value: 'light' as const, label: 'Light' },
];

const BG_TONE_OPTIONS = [
  { value: 'navy'     as const, label: 'Navy'     },
  { value: 'black'    as const, label: 'Black'    },
  { value: 'midnight' as const, label: 'Midnight' },
  { value: 'slate'    as const, label: 'Slate'    },
];

export function PublicDisplaySettings() {
  const config = useAppStore((s) => s.config);
  const { updateConfig } = useTournament();
  const { confirmUnlock } = useLockGuard();

  const [formData, setFormData] = useState<Partial<TournamentConfig>>(() =>
    initialDisplayState(config)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const justSaved = useSuccessFlash(saving);

  const baselineRef = useRef<TournamentConfig | null>(config);

  useEffect(() => {
    if (!config) return;
    setFormData((prev) => {
      const merged: Partial<TournamentConfig> = { ...prev };
      const prevBaseline = baselineRef.current ?? config;
      (Object.keys(initialDisplayState(config)) as Array<keyof TournamentConfig>).forEach((key) => {
        const userTouched =
          JSON.stringify(prev[key]) !== JSON.stringify(prevBaseline[key]);
        if (!userTouched) {
          (merged as Record<string, unknown>)[key] = config[key];
        }
      });
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

  // Grid columns round-trips through 0 ↔ null
  const gridColumnsValue =
    (formData.tvGridColumns ?? null) === null ? 0 : (formData.tvGridColumns as number);

  return (
    <form onSubmit={handleSubmit}>
      <SectionHeader>Layout</SectionHeader>
      <Row label="Display mode" control={
        <Seg
          options={DISPLAY_MODE_OPTIONS}
          value={formData.tvDisplayMode ?? 'strip'}
          onChange={(v) => set('tvDisplayMode', v)}
          ariaLabel="Display mode"
        />
      } />
      <Row label="Grid columns" control={
        <Seg
          options={GRID_COLUMNS_OPTIONS}
          value={gridColumnsValue}
          onChange={(v) => set('tvGridColumns', v === 0 ? null : (v as 1 | 2 | 3 | 4))}
          ariaLabel="Grid columns"
        />
      } />
      <Row label="Card size" control={
        <Seg
          options={CARD_SIZE_OPTIONS}
          value={formData.tvCardSize ?? 'auto'}
          onChange={(v) => set('tvCardSize', v)}
          ariaLabel="Card size"
        />
      } last />

      <SectionHeader>Brand</SectionHeader>
      <Row label="Accent colour" control={
        <ColorSwatchRow
          value={formData.tvAccent ?? '#10b981'}
          onChange={(hex) => set('tvAccent', hex)}
        />
      } />
      <Row label="Theme" control={
        <Seg
          options={THEME_OPTIONS}
          value={formData.tvTheme ?? 'auto'}
          onChange={(v) => set('tvTheme', v)}
          ariaLabel="TV theme"
        />
      } />
      <Row label="Background tone" control={
        <Seg
          options={BG_TONE_OPTIONS}
          value={formData.tvBgTone ?? 'navy'}
          onChange={(v) => set('tvBgTone', v)}
          ariaLabel="Background tone"
        />
      } last />

      <SectionHeader>Content</SectionHeader>
      <Row label="Show scores" control={
        <Toggle
          value={formData.tvShowScores ?? true}
          onChange={(v) => set('tvShowScores', v)}
          ariaLabel="Show scores on public display"
        />
      } last />

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
            'Save display settings'
          )}
        </Button>
      </div>
    </form>
  );
}

function initialDisplayState(
  config: TournamentConfig | null
): Partial<TournamentConfig> {
  return {
    tvDisplayMode: config?.tvDisplayMode ?? 'strip',
    tvGridColumns: config?.tvGridColumns ?? null,
    tvCardSize: config?.tvCardSize ?? 'auto',
    tvAccent: config?.tvAccent ?? '#10b981',
    tvTheme: config?.tvTheme ?? 'auto',
    tvBgTone: config?.tvBgTone ?? 'navy',
    tvShowScores: config?.tvShowScores ?? true,
  };
}
