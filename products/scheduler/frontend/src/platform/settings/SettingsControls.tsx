/**
 * SettingsControls — shared Row + control primitives used by every
 * pane of the Setup tab.
 *
 * The Row contract is locked: flex / items-center / justify-between,
 * gap-6 (24px), h-11 (44px), 1px bottom border unless `last`. Labels
 * are 13px / font-medium / flex-1. Controls go on the right,
 * flex-shrink-0. No descriptions inside rows — labels only.
 *
 * Every Setup form (Tournament, Engine, Public display, Appearance,
 * Data) uses these primitives. Adding a one-off layout = breaking the
 * uniform-rows rule.
 */
import { type ReactNode } from 'react';

import { Select } from '@scheduler/design-system/components';

/* =========================================================================
 * Row — the only layout primitive in the Setup form.
 * ========================================================================= */
interface RowProps {
  label: string;
  control: ReactNode;
  last?: boolean;
}

export function Row({ label, control, last }: RowProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-6 h-11',
        last ? '' : 'border-b border-border/60',
      ].join(' ')}
    >
      <span className="flex-1 text-sm font-medium text-foreground">
        {label}
      </span>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

/* =========================================================================
 * SectionHeader — small uppercase chrome between row groups.
 * ========================================================================= */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="pt-6 pb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </div>
  );
}

/* =========================================================================
 * Seg — segmented radio-group control. One option always selected.
 * ========================================================================= */
export interface SegOption<T extends string | number> {
  value: T;
  label: string;
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden border border-border"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              // MOTION.md §6 Seg: explicit duration-fast + ease-brand
              // so the hover crossfade reads as intentional, not as a
              // Tailwind default.
              'px-3 py-1 text-xs font-medium transition-colors duration-fast ease-brand',
              isActive
                ? 'bg-accent/15 text-accent'
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

/* =========================================================================
 * Toggle — boolean switch. brand-accent on / muted off.
 * ========================================================================= */
export function Toggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={() => onChange(!value)}
      className={[
        // MOTION.md §6 Toggle: track at duration-fast, thumb at
        // duration-standard, both explicit ease-brand so the implicit
        // Tailwind 150ms-linear default never ships.
        'inline-flex h-5 w-9 items-center rounded-full transition-colors duration-fast ease-brand',
        value ? 'bg-accent' : 'bg-muted',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-bg-elev transition-transform duration-standard ease-brand',
          value ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

/* =========================================================================
 * Sized inputs — consistent right-side control vocabulary.
 * ========================================================================= */
const INPUT_CLASS =
  'h-7 rounded-sm border border-border bg-bg-elev px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function TextInput({
  value,
  onChange,
  width = 200,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={INPUT_CLASS}
      style={{ width: `${width}px` }}
    />
  );
}

export function DateInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={INPUT_CLASS}
      style={{ width: '160px' }}
    />
  );
}

export function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={INPUT_CLASS}
      style={{ width: '132px' }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  width = 64,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  width?: number;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className={`${INPUT_CLASS} tabular-nums`}
      style={{ width: `${width}px` }}
    />
  );
}

export function NumberWithSuffix({
  value,
  onChange,
  suffix,
  min,
  max,
  width = 64,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  width?: number;
  ariaLabel?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <NumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        width={width}
        ariaLabel={ariaLabel}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </span>
  );
}

export function SelectInput<T extends string | number>({
  value,
  onChange,
  options,
  width = 180,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegOption<T>[];
  width?: number;
  ariaLabel?: string;
}) {
  // Stringify value/options to bridge T extends string|number → string-only
  // Radix API. Map back to the original T in onChange via the options table.
  const stringOptions = options.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const target = options.find((o) => String(o.value) === v);
        if (target) onChange(target.value);
      }}
      options={stringOptions}
      ariaLabel={ariaLabel}
      size="sm"
      triggerStyle={{ width: `${width}px` }}
    />
  );
}

/* =========================================================================
 * RangeSlider — input[type=range] + live numeric readout (right-anchored).
 * ========================================================================= */
export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-muted accent-accent"
      />
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </span>
  );
}

/* =========================================================================
 * Color-swatch palette — 8 picker dots for the Public-display accent.
 * ========================================================================= */
export const ACCENT_PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'emerald', hex: '#10b981' },
  { name: 'amber',   hex: '#f59e0b' },
  { name: 'rose',    hex: '#f43f5e' },
  { name: 'blue',    hex: '#3b82f6' },
  { name: 'violet',  hex: '#8b5cf6' },
  { name: 'cyan',    hex: '#06b6d4' },
  { name: 'orange',  hex: '#FF6B1A' },
  { name: 'slate',   hex: '#64748b' },
];

export function ColorSwatchRow({
  value,
  onChange,
  palette = ACCENT_PALETTE,
}: {
  value: string;
  onChange: (hex: string) => void;
  palette?: readonly { name: string; hex: string }[];
}) {
  const normalized = value?.toLowerCase() ?? '';
  return (
    <div role="radiogroup" aria-label="Accent colour" className="inline-flex gap-1.5">
      {palette.map(({ name, hex }) => {
        const isActive = normalized === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Set accent to ${name}`}
            onClick={() => onChange(hex)}
            className={[
              'flex h-5 w-5 items-center justify-center rounded-full transition-shadow',
              isActive
                ? 'ring-2 ring-foreground ring-offset-2 ring-offset-bg-elev'
                : 'hover:ring-2 hover:ring-muted-foreground/40 hover:ring-offset-2 hover:ring-offset-bg-elev',
            ].join(' ')}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}
