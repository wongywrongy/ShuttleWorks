/**
 * Select — the canonical dropdown primitive.
 *
 * Wraps @radix-ui/react-select so the menu is portal-rendered with
 * viewport-aware positioning (no more clipping inside scrollable panels
 * or short popovers). Trigger styling matches `Input` (h-7 sm / h-9 md,
 * rounded-sm, hairline border). Content uses the brutalist token chain:
 * 2px border, hard offset shadow, sharp corners.
 *
 * One primitive, one look — replaces the 9 ad-hoc native `<select>` call
 * sites across settings, roster, matches, score-editor, and the
 * control-center dialogs.
 *
 * Empty value: Radix Select forbids `value=""` on items. Callers that
 * need a "no selection" affordance set `clearable` — the component
 * prepends a sentinel `__none__` option labelled by `placeholder` and
 * maps the sentinel back to `''` in `onValueChange`.
 */
import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { CaretDown, Check } from '@phosphor-icons/react';

import { cn } from '../lib/utils';

const NONE_SENTINEL = '__none__';

export interface SelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T | '';
  onValueChange: (value: T | '') => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  ariaLabel?: string;
  /** Extra classes applied to the trigger button. */
  triggerClassName?: string;
  /** Inline style for the trigger (use for dynamic widths). */
  triggerStyle?: React.CSSProperties;
  /** Extra classes applied to the portal content. */
  contentClassName?: string;
  /** sm = h-7 (compact rows); md = h-9 (forms). Default md. */
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Monospaced + tabular-nums on both trigger value and items. */
  mono?: boolean;
  /** Show a "—" reset option that emits `''` when picked. */
  clearable?: boolean;
  /** Forwarded to the trigger button (for autoscroll / focus). */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = '—',
  ariaLabel,
  triggerClassName,
  triggerStyle,
  contentClassName,
  size = 'md',
  disabled,
  mono,
  clearable,
  triggerRef,
}: SelectProps<T>) {
  const sizeClass = size === 'sm' ? 'h-7 px-2 text-sm' : 'h-9 px-3 text-sm';

  return (
    <RadixSelect.Root
      value={value === '' ? undefined : value}
      onValueChange={(v) => {
        onValueChange(v === NONE_SENTINEL ? ('' as T | '') : (v as T));
      }}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        ref={triggerRef}
        aria-label={ariaLabel}
        style={triggerStyle}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-sm border border-input bg-bg-elev',
          'text-foreground transition-colors duration-fast ease-brand',
          'hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'data-[state=open]:border-accent data-[placeholder]:text-muted-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          sizeClass,
          mono && 'font-mono tabular-nums',
          triggerClassName,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <CaretDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-popover overflow-hidden rounded-sm border-2 border-border bg-card shadow-hard',
            'min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)]',
            'data-[state=open]:motion-enter',
            contentClassName,
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {clearable ? (
              <SelectItem
                value={NONE_SENTINEL}
                label={<span className="text-muted-foreground">{placeholder}</span>}
                mono={mono}
              />
            ) : null}
            {options.map((opt) => (
              <SelectItem
                key={String(opt.value)}
                value={String(opt.value)}
                label={opt.label}
                disabled={opt.disabled}
                mono={mono}
              />
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

interface SelectItemProps {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  mono?: boolean;
}

function SelectItem({ value, label, disabled, mono }: SelectItemProps) {
  return (
    <RadixSelect.Item
      value={value}
      disabled={disabled}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none',
        'text-foreground transition-colors duration-fast ease-brand',
        'data-[highlighted]:bg-accent/10 data-[state=checked]:bg-accent/15 data-[state=checked]:text-foreground',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        mono && 'font-mono tabular-nums',
      )}
    >
      <RadixSelect.ItemIndicator className="absolute left-1.5 inline-flex w-4 items-center justify-center">
        <Check className="h-3 w-3 text-accent" aria-hidden="true" />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{label}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
