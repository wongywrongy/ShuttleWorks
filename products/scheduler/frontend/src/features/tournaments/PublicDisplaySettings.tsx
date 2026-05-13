/**
 * PublicDisplaySettings — section 03 (Public display) of the Setup tab.
 *
 * Operator-facing TV configuration: layout mode + grid columns + card
 * size, brand (accent palette + display preset), content visibility.
 * Reads from the live tournament config via useAppStore; saves the
 * subset of fields this pane owns.
 *
 * The row area is wrapped in a `data-tv-preset` surface so changing
 * the Display preset instantly re-themes the whole pane against the
 * preset's bg / text / border — the director sees exactly what the TV
 * will look like without opening the /display page.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TournamentConfig } from '../../api/dto';
import { useTournamentStore } from '../../store/tournamentStore';
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
import {
  DISPLAY_PRESETS,
  DEFAULT_PRESET_ID,
} from '../../pages/publicDisplay/displayPresets';

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

export function PublicDisplaySettings() {
  const config = useTournamentStore((s) => s.config);
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

  const activePresetId = formData.tvPreset ?? DEFAULT_PRESET_ID;

  return (
    <form onSubmit={handleSubmit}>
      {/* Preview surface — applying data-tv-preset cascades the
          preset's --bg / --ink / --rule-soft / --muted overrides to
          every Tailwind token (`bg-background`, `text-foreground`,
          `text-muted-foreground`, `border-border`) inside. The
          director sees the TV's exact palette while configuring. */}
      <div
        data-tv-preset={activePresetId}
        className="bg-background text-foreground -mx-4 px-4 pb-5 transition-colors duration-standard ease-brand"
      >
        <SectionHeader>Layout</SectionHeader>
        <div className="relative grid grid-cols-1 md:grid-cols-2 md:gap-x-12 md:before:absolute md:before:inset-y-0 md:before:left-1/2 md:before:-translate-x-1/2 md:before:w-px md:before:bg-border/60">
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
          } />
          <Row label="Show scores" control={
            <Toggle
              value={formData.tvShowScores ?? true}
              onChange={(v) => set('tvShowScores', v)}
              ariaLabel="Show scores on public display"
            />
          } />
        </div>

        <SectionHeader>Brand</SectionHeader>
        <Row label="Display preset" control={
          <PresetSwatchRow
            value={activePresetId}
            onChange={(id) => set('tvPreset', id)}
          />
        } />
        <Row label="Accent colour" control={
          <ColorSwatchRow
            value={formData.tvAccent ?? '#10b981'}
            onChange={(hex) => set('tvAccent', hex)}
          />
        } last />
      </div>

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

/* =========================================================================
 * PresetSwatchRow — horizontal strip of 8 small preset tiles.
 *
 * Each tile is 40×28 with the preset's bg as fill and a 2px stripe
 * along the bottom in the preset's text color (so light vs. dark
 * presets read at a glance). Selected tile gets a 2px accent ring;
 * native `title` attribute carries the preset name as a tooltip.
 * ========================================================================= */
function PresetSwatchRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Display preset" className="inline-flex gap-1.5">
      {DISPLAY_PRESETS.map((preset) => {
        const isActive = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={preset.name}
            title={preset.name}
            onClick={() => onChange(preset.id)}
            className={[
              'group relative overflow-hidden rounded-sm transition-shadow duration-fast ease-brand',
              isActive
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-elev'
                : 'ring-1 ring-border hover:ring-2 hover:ring-foreground/40 hover:ring-offset-2 hover:ring-offset-bg-elev',
            ].join(' ')}
            style={{
              backgroundColor: preset.swatchBg,
              width: 40,
              height: 28,
            }}
          >
            {/* 2px text-color stripe at the bottom — disambiguates
                dark vs light presets when the bg alone is ambiguous. */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[2px]"
              style={{ backgroundColor: preset.swatchText }}
            />
          </button>
        );
      })}
    </div>
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
    tvPreset: config?.tvPreset ?? DEFAULT_PRESET_ID,
    tvShowScores: config?.tvShowScores ?? true,
  };
}
