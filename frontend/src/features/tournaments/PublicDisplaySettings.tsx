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
    <section
      aria-labelledby="tv-display-heading"
      className="rounded-md border border-border bg-card"
    >
      <header className="flex items-baseline justify-between border-b border-border/60 px-4 py-2.5">
        <h3 id="tv-display-heading" className="text-sm font-semibold text-card-foreground">
          Public display
        </h3>
        <span className="text-2xs text-muted-foreground">
          per-tournament · live preview below
        </span>
      </header>

      <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {/* ── Layout ─────────────────────────────────────────────── */}
        <Group title="Layout">
          <Row label="Mode">
            <ChipRow
              ariaLabel="Display mode"
              value={mode}
              options={MODES}
              onChange={(id) => update({ tvDisplayMode: id })}
            />
          </Row>
          <Row label="Grid cols">
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
          </Row>
          <Row label="Card size">
            <ChipRow
              ariaLabel="Card size"
              value={cardSize}
              options={CARD_SIZES}
              onChange={(id) => update({ tvCardSize: id })}
            />
          </Row>
        </Group>

        {/* ── Brand ──────────────────────────────────────────────── */}
        <Group title="Brand">
          <Row label="Accent">
            <div className="flex flex-wrap items-center gap-1.5">
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
              <span className="ml-1 text-2xs text-muted-foreground">|</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => update({ tvAccent: e.target.value })}
                aria-label="Custom accent color"
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
                className="h-6 w-20 rounded border border-border bg-background px-1.5 font-mono text-2xs uppercase"
              />
            </div>
          </Row>
          <Row label="Theme">
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
                      'rounded border px-2 py-0.5 text-2xs font-medium',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Background" hint="Only used when theme is dark.">
            <div role="radiogroup" aria-label="Background tone" className="flex flex-wrap items-center gap-1.5">
              {BG_TONES.map((t) => {
                const isActive = bgTone === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => update({ tvBgTone: t.id })}
                    title={t.label}
                    className={[
                      INTERACTIVE_BASE,
                      'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-medium',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-border"
                      style={{ backgroundColor: t.swatch }}
                      aria-hidden
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Row>
        </Group>

        {/* ── Content ────────────────────────────────────────────── */}
        <Group title="Content">
          <Row label="Show scores">
            <Switch
              checked={showScores}
              onChange={(next) => update({ tvShowScores: next })}
              label={showScores ? 'On' : 'Off'}
            />
          </Row>
        </Group>
      </div>
    </section>
  );
}

// ── Layout primitives ─────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex-shrink-0">{children}</div>
      </div>
      {hint && <p className="mt-0.5 text-2xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

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
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
