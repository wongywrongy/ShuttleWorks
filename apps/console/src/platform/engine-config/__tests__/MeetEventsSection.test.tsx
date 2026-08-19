/**
 * Events are user-defined, not a fixed five.
 *
 * The rules live in `validateEventCode` so they are stated once and tested
 * against the real thing rather than re-described here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  MeetEventsSection,
  validateEventCode,
  eventLabel,
  MAX_EVENTS,
  MAX_EVENT_CODE_LENGTH,
  DEFAULT_RANKS,
} from '../MeetEventsSection';

describe('validateEventCode', () => {
  it('accepts a new letters-only code, upper-casing and trimming it', () => {
    expect(validateEventCode('  bs ', ['MS'])).toEqual({ code: 'BS' });
  });

  it('rejects an empty code', () => {
    expect(validateEventCode('   ', [])).toEqual({ error: 'Enter an event code.' });
  });

  it('rejects a duplicate', () => {
    expect(validateEventCode('ms', ['MS'])).toEqual({ error: 'MS is already an event.' });
  });

  it('rejects digits — ranks are addressed as prefix+digits', () => {
    // "MD2" as an event code would make the rank "MD2" ambiguous between
    // event MD position 2 and event MD2 position 1.
    expect(validateEventCode('MD2', [])).toEqual({
      error: 'Use letters only, no digits or spaces.',
    });
    expect(validateEventCode('MIXED DOUBLES', [])).toEqual({
      error: 'Use letters only, no digits or spaces.',
    });
  });

  it('rejects a code past the backend MAX_CODE bound', () => {
    const tooLong = 'A'.repeat(MAX_EVENT_CODE_LENGTH + 1);
    expect(validateEventCode(tooLong, [])).toEqual({
      error: `Event codes are at most ${MAX_EVENT_CODE_LENGTH} characters.`,
    });
  });

  it('stops at the backend MAX_RANKS bound rather than sending a 422', () => {
    const full = Array.from({ length: MAX_EVENTS }, (_, i) => `E${i}`);
    expect(validateEventCode('NEW', full)).toEqual({
      error: `A meet can have at most ${MAX_EVENTS} events.`,
    });
  });
});

describe('eventLabel', () => {
  it('names the known disciplines and falls back to the raw code', () => {
    expect(eventLabel('MS')).toBe("Men's Singles");
    expect(eventLabel('BS')).toBe('BS');
    // Null-prototype map: an inherited key must not leak a function.
    expect(eventLabel('toString')).toBe('toString');
  });
});

describe('<MeetEventsSection />', () => {
  const render_ = (rankCounts: Record<string, number>, onChange = vi.fn()) => {
    render(<MeetEventsSection rankCounts={rankCounts} onChange={onChange} />);
    return onChange;
  };

  it('renders a row per configured event, not a fixed five', () => {
    render_({ MS: 3, BS: 2 });
    expect(screen.getByLabelText("Men's Singles positions")).toHaveValue(3);
    expect(screen.getByLabelText('BS positions')).toHaveValue(2);
    // The old hardcoded list would have rendered these regardless.
    expect(screen.queryByLabelText("Women's Singles positions")).toBeNull();
    expect(screen.queryByLabelText('Mixed Doubles positions')).toBeNull();
  });

  it('adds a custom event with a starting count', () => {
    const onChange = render_({ MS: 3 });
    fireEvent.change(screen.getByLabelText('Event code'), { target: { value: 'bs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith({ MS: 3, BS: 1 });
  });

  it('surfaces a validation error inline and does not call onChange', () => {
    const onChange = render_({ MS: 3 });
    fireEvent.change(screen.getByLabelText('Event code'), { target: { value: 'MS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('MS is already an event.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes an event', () => {
    const onChange = render_({ MS: 3, XD: 2 });
    fireEvent.click(screen.getByRole('button', { name: "Remove Men's Singles" }));
    expect(onChange).toHaveBeenCalledWith({ XD: 2 });
  });

  it('edits a count without disturbing the others', () => {
    const onChange = render_({ MS: 3, XD: 2 });
    fireEvent.change(screen.getByLabelText("Men's Singles positions"), {
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenCalledWith({ MS: 5, XD: 2 });
  });

  it('offers no add/remove affordances when read-only', () => {
    render(
      <MeetEventsSection rankCounts={{ MS: 3 }} onChange={vi.fn()} readOnly />,
    );
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    // The value itself stays visible — read-only, not hidden.
    expect(screen.getByLabelText("Men's Singles positions")).toBeInTheDocument();
  });

  it('handles an empty event set without rendering a broken surface', () => {
    render_({});
    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('DEFAULT_RANKS is a seed, and the five are still what a new meet gets', () => {
    expect(Object.keys(DEFAULT_RANKS)).toEqual(['MS', 'WS', 'MD', 'WD', 'XD']);
  });
});
