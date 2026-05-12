/**
 * Public Display (TV) settings panel.
 *
 * Enterprise three-section layout — Layout / Brand / Content — each
 * a labelled group of compact rows. Lives inside the admin shell
 * above the embedded ``/display`` preview, never on the standalone
 * fullscreen window.
 *
 * Design rules:
 *   • Every row: eyebrow label (left) + control (right). One row per
 *     setting. No subheaders inside a row.
 *   • Inline minimal toggles + chips — no large radiopills.
 *   • All values persist on ``TournamentConfig`` so the venue's setup
 *     survives reloads.
 */
import { useAppStore } from '../../store/appStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { TournamentConfig } from '../../api/dto';
import { Surface, Section, Field } from '../settings/SettingsPrimitives';

const ACCENT_PRESETS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'violet', label: 'Violet', hex: '#7c3aed' },
  { id: 'rose', label: 'Rose', hex: '#e11d48' },
  { id: 'amber', label: 'Amber', hex: '#d97706' },
  { id: 'teal', label: 'Teal', hex: '#0d9488' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'orange', label: 'Orange', hex: '#ea580c' },
];

const BG_TONES: Array<{ id: NonNullable<TournamentConfig['tvBgTone']>; label: string; swatch: string }> = [
  { id: 'navy',     label: 'Navy',     swatch: '#020617' },
  { id: 'black',    label: 'Black',    swatch: '#000000' },
  { id: 'midnight', label: 'Midnight', swatch: '#0a0e2a' },
  { id: 'slate',    label: 'Slate',    swatch: '#0f172a' },
];

const CARD_SIZES: Array<{ id: NonNullable<TournamentConfig['tvCardSize']>; label: string }> = [
  { id: 'auto',        label: 'Auto' },
  { id: 'compact',     label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'large',       label: 'Large' },
];

const MODES: Array<{ id: NonNullable<TournamentConfig['tvDisplayMode']>; label: string }> = [
  { id: 'strip', label: 'Strip' },
  { id: 'grid',  label: 'Grid' },
  { id: 'list',  label: 'List' },
];

export function PublicDisplaySettings() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  if (!config) return null;

  const update = (patch: Partial<TournamentConfig>) =>
    setConfig({ ...config, ...patch });

  const accent = (config.tvAccent ?? '#10b981').toLowerCase();
  const bgTone = config.tvBgTone ?? 'navy';
  const cardSize = config.tvCardSize ?? 'auto';
  const mode = config.tvDisplayMode ?? 'strip';
  const gridCols = config.tvGridColumns ?? null;
  const showScores = config.tvShowScores !== false;

  return (
    <Surface>
      <Section
        title="Layout"
        description="How matches are arranged on the venue TV. Live preview below."
      >
        <Field
          label="Display mode"
          hint="Strip is a single horizontal banner. Grid is a card grid sized to courts. List is a tall vertical roster."
        >
          <ChipRow
            ariaLabel="Display mode"
            value={mode}
            options={MODES}
            onChange={(id) => update({ tvDisplayMode: id })}
          />
        </Field>
        <Field
          label="Grid columns"
          hint="Force a fixed column count when in Grid mode. Auto picks the best fit for the screen width."
        >
          <ChipRow
            ariaLabel="Grid columns"
            value={gridCols ?? 'auto'}
            options={[
              { id: 'auto', label: 'Auto' },
              { id: 1, label: '1' },
              { id: 2, label: '2' },
              { id: 3, label: '3' },
              { id: 4, label: '4' },
            ]}
            onChange={(id) =>
              update({ tvGridColumns: id === 'auto' ? null : (id as 1 | 2 | 3 | 4) })
            }
          />
        </Field>
        <Field
          label="Card size"
          hint="Compact fits more matches on screen. Large is readable from across the venue."
        >
          <ChipRow
            ariaLabel="Card size"
            value={cardSize}
            options={CARD_SIZES}
            onChange={(id) => update({ tvCardSize: id })}
          />
        </Field>
      </Section>

      <Section
        title="Brand"
        description="Colour and theme of the public display."
      >
          <Field
            label="Accent colour"
            hint="Used for the LIVE badge, court rails, and primary score highlights."
          >
            {/* Two-line layout: preset swatches first, custom hex picker
                below. Stacking guarantees the row's intrinsic width
                never exceeds the panel column even with 8 swatches +
                color picker + hex input — the previous one-line layout
                could overflow into the neighbouring field on narrow
                viewports. */}
            <div className="flex flex-col items-end gap-1.5">
              <div
                role="radiogroup"
                aria-label="Accent presets"
                className="flex flex-wrap items-center justify-end gap-1.5"
              >
                {ACCENT_PRESETS.map((p) => {
                  const isActive = accent === p.hex.toLowerCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={p.label}
                      title={`${p.label} · ${p.hex}`}
                      onClick={() => update({ tvAccent: p.hex })}
                      className={[
                        INTERACTIVE_BASE,
                        'h-5 w-5 rounded-full border-2',
                        isActive
                          ? 'border-foreground ring-2 ring-ring ring-offset-2 ring-offset-card'
                          : 'border-transparent hover:border-border',
                      ].join(' ')}
                      style={{ backgroundColor: p.hex }}
                    />
                  );
                })}
              </div>
              <div className="inline-flex items-center gap-1">
                <span className="text-2xs text-muted-foreground">Custom</span>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => update({ tvAccent: e.target.value })}
                  aria-label="Custom accent colour"
                  title={`Custom · ${accent}`}
                  className="h-6 w-6 cursor-pointer rounded border border-border bg-card p-0.5"
                />
                <input
                  type="text"
                  value={accent}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (/^#?[0-9a-fA-F]{6}$/.test(v.replace(/^#/, ''))) {
                      update({ tvAccent: v.startsWith('#') ? v : `#${v}` });
                    }
                  }}
                  placeholder="#10b981"
                  aria-label="Custom accent hex"
                  className="h-6 w-24 rounded border border-border bg-background px-2 font-mono text-2xs uppercase tracking-wider"
                />
              </div>
            </div>
          </Field>
          <Field
            label="Theme"
            hint="Auto follows the operator's app theme. Dark or Light forces a fixed mode."
          >
            <div role="radiogroup" aria-label="TV theme" className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'auto' as const, label: 'Auto' },
                { id: 'dark' as const, label: 'Dark' },
                { id: 'light' as const, label: 'Light' },
              ].map((t) => {
                const isActive = (config.tvTheme ?? 'dark') === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => update({ tvTheme: t.id })}
                    className={[
                      INTERACTIVE_BASE,
                      'rounded border px-2.5 py-1 text-xs font-medium',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label="Background tone"
            hint={
              (config.tvTheme ?? 'dark') === 'light'
                ? 'Inactive — only used when the TV theme is Dark.'
                : 'Pick the dark surface tone that flatters your accent colour.'
            }
            disabled={(config.tvTheme ?? 'dark') === 'light'}
          >
            <div
              role="radiogroup"
              aria-label="Background tone"
              aria-disabled={(config.tvTheme ?? 'dark') === 'light'}
              className="flex flex-wrap items-center gap-1.5"
            >
              {BG_TONES.map((t) => {
                const isActive = bgTone === t.id;
                const isLightTheme = (config.tvTheme ?? 'dark') === 'light';
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => update({ tvBgTone: t.id })}
                    disabled={isLightTheme}
                    title={
                      isLightTheme
                        ? 'Switch to Dark theme to choose a background tone'
                        : t.label
                    }
                    className={[
                      INTERACTIVE_BASE,
                      'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium',
                      isLightTheme
                        ? 'cursor-not-allowed opacity-50'
                        : isActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    ].join(' ')}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-border/60"
                      style={{ backgroundColor: t.swatch }}
                      aria-hidden
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
      </Section>

      <Section
        title="Content"
        description="What data appears on each match card."
      >
        <Field
          label="Show scores"
          hint="Display set scores alongside player names. Turn off for spectator privacy or before official results are posted."
        >
          <Switch
            checked={showScores}
            onChange={(next) => update({ tvShowScores: next })}
            label={showScores ? 'On' : 'Off'}
          />
        </Field>
      </Section>
    </Surface>
  );
}

// ── Layout primitives ─────────────────────────────────────────────

interface ChipOption<T extends string | number> {
  id: T;
  label: string;
}

function ChipRow<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={String(opt.id)}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            className={[
              INTERACTIVE_BASE,
              'rounded px-2 py-0.5 text-2xs font-medium',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          INTERACTIVE_BASE,
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
      <span className="text-xs text-foreground tabular-nums">{label}</span>
    </label>
  );
}
