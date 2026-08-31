import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ActiveChoice } from '../ActiveChoice';

function renderChoice(active: boolean) {
  render(
    <MemoryRouter>
      <ActiveChoice active={active} geometry="segment" semantics="tab">
        Assignment
      </ActiveChoice>
    </MemoryRouter>,
  );
  return screen.getByRole('tab');
}

describe('ActiveChoice', () => {
  it('owns the one solid active fill and contrasting ink pair', () => {
    const choice = renderChoice(true);
    expect(choice).toHaveClass('bg-action-primary', 'text-text-on-accent');
    expect(choice).not.toHaveClass('font-semibold', 'border-b-2');
  });

  it('keeps inactive choices bare apart from a neutral hover state', () => {
    const choice = renderChoice(false);
    const classes = choice.className.split(/\s+/);
    expect(classes.filter((name) => name.startsWith('bg-'))).toEqual([]);
    expect(classes.filter((name) => name.startsWith('border-'))).toEqual([]);
    expect(classes.some((name) => name.includes('inset_'))).toBe(false);
  });

  it('uses a contrasting focus ring on the solid active fill', () => {
    expect(renderChoice(true)).toHaveClass('focus-visible:ring-text-on-accent');
  });

  it.each([
    ['page', 'aria-current', 'page'],
    ['tab', 'aria-selected', 'true'],
    ['radio', 'aria-checked', 'true'],
    ['pressed', 'aria-pressed', 'true'],
  ] as const)('carries %s semantics independently of styling', (semantics, attribute, value) => {
    render(
      <MemoryRouter>
        <ActiveChoice active geometry="segment" semantics={semantics}>
          Choice
        </ActiveChoice>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole(semantics === 'page' ? 'button' : semantics === 'pressed' ? 'button' : semantics),
    ).toHaveAttribute(attribute, value);
  });
});
