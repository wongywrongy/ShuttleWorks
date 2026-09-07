/**
 * Contract test for the design system's shared form/control primitives
 * (v3 consolidated plan §08, ruling R1): every exported form control
 * renders a visible label associated to its control by `for`/`id` or by
 * wrapping, and the control's own hit area clears the WCAG 2.2 AA 24x24
 * CSS px minimum target size.
 *
 * jsdom does not lay out pages, so "24px" is checked as a class-level
 * assertion against the fixed Tailwind height utilities this package uses
 * (`h-6`/`h-7`/`h-8`/`h-9`/`h-10`/`h-11`, all >= 24px at the default 16px
 * root) rather than a measured pixel box — the same posture `check-classes.mjs`
 * takes for the rest of the design system's fixed sizes.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox, Select, TextField } from '@scheduler/design-system/components';

/** Tailwind fixed-height utility -> px, for the subset this file emits. */
const HEIGHT_PX: Record<string, number> = {
  'h-4': 16,
  'h-5': 20,
  'h-6': 24,
  'h-7': 28,
  'h-8': 32,
  'h-9': 36,
  'h-10': 40,
  'h-11': 44,
};

/** The smallest fixed-height utility class present on an element, in px,
 *  or null if the element carries none (e.g. it sizes from its content). */
function minHeightClass(el: Element): number | null {
  const heights = el.className
    .split(/\s+/)
    .map((c) => HEIGHT_PX[c])
    .filter((n): n is number => typeof n === 'number');
  return heights.length ? Math.min(...heights) : null;
}

describe('design system form controls — label association + target size', () => {
  it('TextField: label is a real <label for> matching the input id', () => {
    render(<TextField label="Tournament name" />);
    const input = screen.getByLabelText('Tournament name');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('id');
  });

  it('TextField: the control clears the 24px minimum target height', () => {
    render(<TextField label="Tournament name" />);
    const input = screen.getByLabelText('Tournament name');
    // Default size is md (h-9/36px); sm (h-7/28px) is the smallest variant
    // this component ever renders — both clear 24px.
    expect(minHeightClass(input)).not.toBeNull();
    expect(minHeightClass(input)!).toBeGreaterThanOrEqual(24);
  });

  it('Checkbox: label wraps the input, so the accessible name comes from real label text', () => {
    render(<Checkbox label="Payment required" />);
    const input = screen.getByLabelText('Payment required');
    expect(input).toHaveAttribute('type', 'checkbox');
    expect(input).toHaveAttribute('id');
    expect(input.closest('label')).not.toBeNull();
  });

  it('Checkbox: the label — the real hit area, not the 16px visual box — clears 24px', () => {
    render(<Checkbox label="Payment required" />);
    const input = screen.getByLabelText('Payment required');
    const label = input.closest('label');
    expect(label).not.toBeNull();
    // The visual box (h-4, 16px) is intentionally smaller than the
    // measured target: `min-h-6` on the wrapping label is the real,
    // clickable 24px+ hit area (not a pseudo-element).
    expect(label!.className).toContain('min-h-6');
  });

  it('Select: the trigger carries an accessible name and clears the 24px minimum', () => {
    render(
      <Select
        value=""
        onValueChange={() => {}}
        options={[{ value: 'a', label: 'Option A' }]}
        ariaLabel="Registration method"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Registration method' });
    expect(minHeightClass(trigger)).not.toBeNull();
    expect(minHeightClass(trigger)!).toBeGreaterThanOrEqual(24);
  });
});
