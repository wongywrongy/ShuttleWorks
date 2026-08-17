/**
 * SettingsControls — the shared grammar for EVERY configuration surface.
 *
 * TWO ROW TYPES, and the control decides which (2026-08-06 design review):
 *
 *   - `Row`      label left, control right, h-11, hairline. Toggles,
 *                selects, numbers, segmented controls — anything whose
 *                control is small and fixed-width. Contract is locked:
 *                flex / items-center / justify-between, gap-6 (24px),
 *                1px bottom border unless `last`, labels 13px/medium/flex-1,
 *                controls flex-shrink-0.
 *   - `FieldRow` label above, full-width input, hint below. FREE TEXT only
 *                — names, emails, passwords, URLs. A wide text input cannot
 *                live in a right-aligned control slot, which is exactly why
 *                the global-settings and workspace surfaces each grew their
 *                own stacked pattern instead of using this file.
 *
 * The rule: free text → FieldRow, everything else → Row. There is no third
 * option. A one-off layout is a bug, not a variation.
 *
 * Sections come from `SectionHeader`, which carries real weight — the old
 * 10px all-caps label was the same visual weight as the rows it introduced,
 * so nothing on a settings page outranked anything else.
 *
 * Pages are SINGLE COLUMN. The Meet config surface used to split these rows
 * across two unrelated columns while Venue & schedule ran one column off the
 * identical primitives; same components, different products to the eye.
 */
import { useState, type ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';

import { Select, TextField, type TextFieldProps } from '@scheduler/design-system/components';

/* =========================================================================
 * Row — the only layout primitive in the Setup form.
 * ========================================================================= */
interface RowProps {
  /** Usually a plain string; a ReactNode is allowed for labels that carry
   *  an inline accent code (e.g. discipline name + azure event code). The
   *  layout contract above is unchanged. */
  label: ReactNode;
  control: ReactNode;
  last?: boolean;
  /**
   * This row states a fact rather than offering a control.
   *
   * Bracket Configuration opens with five rows of derived summary (active
   * disciplines, then one line per event) laid out exactly like the editable
   * rows beneath them, so the page read as uniformly editable and the summary
   * read as five settings that had lost their inputs. A readout is shorter,
   * carries no separator, and puts its value in the muted tier: a run of them
   * reads as one block of facts, and the first real control after it is
   * unmistakable.
   */
  readOnly?: boolean;
}

/**
 * The control column, fixed for every row on every config surface.
 *
 * `justify-between` alone already put controls on a common right edge, so the
 * misalignment the 2026-08-17 review saw was one level in: a segmented control
 * is as wide as its own labels, so "Dual | Tri" (88px) and
 * "11 points | 15 points | 21 points" (222px) shared a right edge and started
 * 134px apart. Three rows, three apparent layouts. A fixed column plus a `Seg`
 * that fills it gives every segmented row the same two edges.
 *
 * ONE width, not the four slot sizes the brief sketched (xs/sm/md/full): every
 * slot would share this right edge anyway, so a per-row width knob would only
 * vary where a control's LEFT edge fell, and no row in the app wants that. The
 * controls that should fill the column do; the rest sit right-aligned in it.
 * 240px is the widest segmented control the app renders ("Best of 1 / Best of
 * 3 / Best of 5", 226px) rounded to the spacing ladder.
 */
const CONTROL_COL = 'w-60';

export function Row({ label, control, last, readOnly }: RowProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-6',
        readOnly ? 'h-9' : 'h-11',
        last || readOnly ? '' : 'border-b border-border/60',
      ].join(' ')}
    >
      <span
        className={[
          'flex-1 text-sm',
          readOnly ? 'text-foreground' : 'font-medium text-foreground',
        ].join(' ')}
      >
        {label}
      </span>
      <div
        className={[
          'flex flex-shrink-0 items-center justify-end',
          CONTROL_COL,
          readOnly ? 'text-sm text-muted-foreground' : '',
        ].join(' ')}
      >
        {control}
      </div>
    </div>
  );
}

/* =========================================================================
 * FieldRow — the free-text row. Label above, full-width input, hint below.
 *
 * Delegates to the design system's TextField so the input chrome (border,
 * radius, focus ring, error wiring, password reveal) is the same object
 * everywhere; this wrapper exists to give the settings grammar a single
 * named row type rather than call sites reaching for TextField directly and
 * each choosing their own spacing.
 * ========================================================================= */
export interface FieldRowProps extends TextFieldProps {
  /** Bottom hairline, matching `Row`. Omit on the last field in a section. */
  last?: boolean;
}

export function FieldRow({ last, className = '', ...field }: FieldRowProps) {
  return (
    <div className={['py-3', last ? '' : 'border-b border-border/60', className].join(' ')}>
      <TextField {...field} />
    </div>
  );
}

/* =========================================================================
 * SectionHeader — the group heading between row runs.
 *
 * Was a 10px all-caps muted label: the same visual weight as the rows it
 * introduced, which is what made settings pages read as one undifferentiated
 * list. It sits a full step ABOVE the row labels on the type ladder (16px
 * semibold vs the rows' 14px medium) with a rule beneath. A section header at
 * the same size as its rows is not a header, whatever weight it carries.
 * ========================================================================= */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    /* A real heading, matching `Section` — see the note there. */
    <h3 className="border-b border-border pb-2 pt-8 text-base font-semibold tracking-tight text-foreground first:pt-0">
      {children}
    </h3>
  );
}

/* =========================================================================
 * Section — a collapsible group of rows. The unit every config surface is
 * built from.
 *
 * OPEN by default, with disclosure reserved for genuinely advanced groups.
 * Collapsed content is not in the DOM, so browser find cannot reach it, and
 * find is exactly how someone locates a rarely-touched option when they do
 * not know which section owns it. Collapse the solver internals; leave the
 * settings a director actually reads visible.
 *
 * EVERY row inside sits at ONE indent. Dependent rows used to be pushed in
 * with a left rule (points-per-set under score type, the utilization weight
 * under its toggle), which meant the eye had to track two rails down a form
 * that already had four section levels. Dependency is carried by the dimmed
 * + aria-disabled state instead, which is the part that actually tells you
 * the control is inert.
 * ========================================================================= */
export function Section({
  title,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional control on the heading rule, right-aligned — a section-scoped
   *  affordance such as Reset. It sits OUTSIDE the disclosure button: nesting
   *  a button inside a button is invalid HTML, and clicking Reset would also
   *  collapse the section it just reset. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    /* Tight: closed, this surface is a stack of one-line headers, so the
       32px section gap that suited open sections left it looking sparse. */
    <section className="pt-3 first:pt-0">
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        {/* A real heading WRAPPING the disclosure button — the WAI-ARIA
            disclosure pattern. A bare button carries no heading role, so a
            surface built only from these had no document outline at all:
            screen-reader heading navigation skipped straight past every
            section title on the page. */}
        <h3 className="flex-1 text-base font-semibold tracking-tight text-foreground">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 text-left"
          >
            <CaretRight
              aria-hidden="true"
              className={[
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                open ? 'rotate-90' : '',
              ].join(' ')}
            />
            {title}
          </button>
        </h3>
        {action != null ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div>{children}</div> : null}
    </section>
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
  disabled = false,
  fill = true,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  /** Real per-button `disabled` — a wrapper's `pointer-events-none` only
   *  blocks the mouse; the buttons would stay keyboard-operable. */
  disabled?: boolean;
  /** Span the parent (the settings `Row` control column) with equal-width
   *  options, so every segmented row shares both edges. Default, because
   *  every use but one is a settings row. Pass `false` in a toolbar, where
   *  the control should be as wide as its own labels. */
  fill?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={[
        'overflow-hidden border border-border',
        fill ? 'flex w-full' : 'inline-flex',
      ].join(' ')}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={[
              // MOTION.md §6 Seg: explicit duration-fast + ease-brand
              // so the hover crossfade reads as intentional, not as a
              // Tailwind default.
              'px-3 py-1 text-xs font-medium transition-colors duration-fast ease-brand',
              fill ? 'flex-1 whitespace-nowrap' : '',
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
    // The unit gets a fixed column so the INPUT lands at the same x down the
    // form. Right-aligning the pair as a unit (the old behavior) meant the
    // suffix's own length set the box's right edge, so "8 positions" and
    // "30 min" put their boxes 29px apart on the same page. The reserved width
    // fits the longest unit the app renders ("slots · 60 min"); shorter ones
    // leave whitespace, which is invisible, unlike a stepped column of boxes.
    <span className="inline-flex items-baseline gap-2">
      <NumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        width={width}
        ariaLabel={ariaLabel}
      />
      <span className="w-24 text-xs text-muted-foreground">{suffix}</span>
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
    // Fills the row's control column, so the track is the same length on every
    // slider row and the readout never moves as the number changes (CFG-2).
    // The readout sits at the column's right edge rather than lining up with
    // the number inputs' boxes: those now sit left of their fixed unit column,
    // and aligning one slider to them would misalign every slider with every
    // other control. Boxes align with boxes; the readout holds its own slot.
    <span className="flex w-full items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-accent"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </span>
  );
}
