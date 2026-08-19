import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  EventPicker,
  EVENT_PICKER_SEARCH_THRESHOLD,
  type EventPickerOption,
} from '../EventPicker';

const DISCIPLINES = ['MS', 'WS', 'MD', 'WD', 'XD'];

/** `n` options spread across the five disciplines, the shape of the 74-option
 *  flat list this component exists to replace. */
function options(n: number): EventPickerOption[] {
  return Array.from({ length: n }, (_, i) => {
    const discipline = DISCIPLINES[i % DISCIPLINES.length];
    return {
      id: `ev-${i}`,
      code: `${discipline}${Math.floor(i / DISCIPLINES.length) + 1}`,
      discipline,
      meta: `${i} entries`,
    };
  });
}

const searchBox = () => screen.queryByRole('searchbox', { name: /search/i });

describe('EventPicker search threshold', () => {
  it('shows no search box at or below the threshold', () => {
    render(
      <EventPicker
        options={options(EVENT_PICKER_SEARCH_THRESHOLD)}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    // Ten options are all on screen already; a search box would be furniture.
    expect(searchBox()).toBeNull();
  });

  it('shows a search box past the threshold', () => {
    render(
      <EventPicker
        options={options(EVENT_PICKER_SEARCH_THRESHOLD + 1)}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(searchBox()).not.toBeNull();
  });

  it('filters on code, name and discipline, and keeps the box while it narrows', () => {
    render(
      <EventPicker
        options={[
          ...options(74),
          { id: 'named', code: 'BS1', discipline: 'BS', name: 'Boys singles' },
        ]}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    const box = searchBox();
    expect(box).not.toBeNull();

    fireEvent.change(box as HTMLElement, { target: { value: 'boys' } });
    expect(screen.getByText('BS1')).toBeInTheDocument();
    expect(screen.queryByText('XD1')).toBeNull();
    // The threshold reads the option COUNT, not the match count: a box that
    // vanished mid-query would strand the operator inside their own filter.
    expect(searchBox()).not.toBeNull();

    fireEvent.change(box as HTMLElement, { target: { value: 'zzz' } });
    expect(screen.getByText('No events match this search.')).toBeInTheDocument();
  });
});

describe('EventPicker grouping', () => {
  it('groups by discipline in first-appearance order', () => {
    render(
      <EventPicker
        options={options(74)}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    const groups = screen
      .getAllByRole('group')
      .filter((g) => g.getAttribute('aria-label') !== 'Event');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(DISCIPLINES);
    // Every option landed in its own discipline's group, none orphaned.
    expect(
      groups.reduce((n, g) => n + within(g).getAllByRole('radio').length, 0),
    ).toBe(74);
  });

  it('groups operator-defined codes without a hardcoded label map', () => {
    // Defect D1's root: a fixed {MS,WS,MD,WD,XD} table cannot name "BS".
    render(
      <EventPicker
        options={[{ id: 'a', code: 'BS1', discipline: 'BS' }]}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('group', { name: 'BS' })).toBeInTheDocument();
    expect(screen.getByText('BS')).toBeInTheDocument();
  });
});

describe('EventPicker single select', () => {
  it('announces selection as a radio and reports the picked id', () => {
    const onChange = vi.fn();
    render(
      <EventPicker
        options={options(12)}
        ariaLabel="Event"
        value="ev-3"
        onChange={onChange}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(12);
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);

    // Queried by accessible name, not by index: DOM order is grouped by
    // discipline, which is the point.
    fireEvent.click(screen.getByRole('radio', { name: 'MS2 5 entries' })); // ev-5
    expect(onChange).toHaveBeenCalledWith('ev-5');
  });

  it('offers a clear option only when asked, and emits null for it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EventPicker
        options={options(3)}
        ariaLabel="Event"
        value="ev-1"
        onChange={onChange}
      />,
    );
    expect(screen.queryByText('No event')).toBeNull();

    rerender(
      <EventPicker
        options={options(3)}
        ariaLabel="Event"
        value="ev-1"
        onChange={onChange}
        clearable
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /no event/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders per-option context and honours disabled', () => {
    render(
      <EventPicker
        options={[
          { id: 'a', code: 'XD1', discipline: 'XD', meta: '16 draw · LIVE' },
          { id: 'b', code: 'XD2', discipline: 'XD', disabled: true },
        ]}
        ariaLabel="Event"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('16 draw · LIVE')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')[1]).toBeDisabled();
  });
});

describe('EventPicker opt-in behaviors (SP-CONSOLE-3A)', () => {
  it('defaults leave the other consumers untouched: no chips, no carets', () => {
    render(
      <EventPicker
        options={options(12)}
        ariaLabel="Participants"
        multiple
        value={['ev-0']}
        onChange={() => {}}
        testId="picker"
      />,
    );
    expect(screen.queryByTestId('picker-chips')).toBeNull();
    expect(screen.queryByTestId('picker-section-MS')).toBeNull();
  });

  it('selectedChips: pins removable chips above the list; a disabled option keeps its chip but loses the ×', () => {
    const onChange = vi.fn();
    render(
      <EventPicker
        options={[
          { id: 'a', code: 'BS2', discipline: 'BS' },
          { id: 'b', code: 'GD4', discipline: 'GD', disabled: true },
        ]}
        ariaLabel="Events"
        multiple
        value={['a', 'b']}
        onChange={onChange}
        selectedChips
        testId="picker"
      />,
    );
    const chips = screen.getByTestId('picker-chips');
    expect(within(chips).getByText('BS2')).toBeInTheDocument();
    expect(within(chips).getByText('GD4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove GD4' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove BS2' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('collapsedGroups: sections rest closed except defaults, and a live search overrides the collapse', () => {
    render(
      <EventPicker
        options={options(74)}
        ariaLabel="Events"
        multiple
        value={[]}
        onChange={() => {}}
        collapsedGroups
        defaultOpenGroups={['MD']}
        testId="picker"
      />,
    );
    // Only the held discipline's rows are on screen at rest.
    expect(screen.queryByRole('checkbox', { name: /^MS1\b/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /^MD1\b/ })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('picker-section-MS'));
    expect(screen.getByRole('checkbox', { name: /^MS1\b/ })).toBeInTheDocument();

    // A match must never hide behind a closed caret.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xd1 ' } });
    expect(screen.getByRole('checkbox', { name: /^XD1\b/ })).toBeInTheDocument();
  });

  it('occupiedBy: names the occupant and joins the search haystack', () => {
    render(
      <EventPicker
        options={[
          ...options(12),
          {
            id: 'slot',
            code: 'BS1',
            discipline: 'BS',
            occupiedBy: 'Aiden Nakamura',
          },
        ]}
        ariaLabel="Events"
        multiple
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Aiden Nakamura')).toBeInTheDocument();
    // Finding which slots a player holds is the desk's real swap lookup.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nakamura' } });
    expect(screen.getByRole('checkbox', { name: /^BS1/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^MS1/ })).toBeNull();
  });
});

describe('EventPicker multi select', () => {
  it('is a checkbox list that announces state and toggles both ways', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EventPicker
        options={options(76)}
        ariaLabel="Participants"
        multiple
        value={['ev-0', 'ev-1']}
        onChange={onChange}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(76);
    // Real state, not a ☑/☐ glyph with nothing behind it.
    expect(screen.getByRole('checkbox', { name: 'MS1 0 entries' })).toBeChecked(); // ev-0
    expect(
      screen.getByRole('checkbox', { name: 'MD1 2 entries' }), // ev-2
    ).not.toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'MD1 2 entries' }));
    expect(onChange).toHaveBeenCalledWith(['ev-0', 'ev-1', 'ev-2']);

    onChange.mockClear();
    rerender(
      <EventPicker
        options={options(76)}
        ariaLabel="Participants"
        multiple
        value={['ev-0', 'ev-1']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'WS1 1 entries' })); // ev-1
    expect(onChange).toHaveBeenCalledWith(['ev-0']);
  });
});
