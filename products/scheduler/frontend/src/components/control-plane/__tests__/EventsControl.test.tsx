import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EventsControl, EventBadge } from '../EventsControl';

describe('EventsControl', () => {
  it('summarizes entered codes as badges per category, "Not entered" otherwise', () => {
    render(
      <EventsControl
        entries={['MS1', 'MD2', 'WD1']}
        renderTypeEditor={() => null}
      />,
    );
    const singles = screen.getByTestId('events-category-singles');
    const doubles = screen.getByTestId('events-category-doubles');
    const mixed = screen.getByTestId('events-category-mixed');
    expect(within(singles).getByText('MS1')).toBeInTheDocument();
    expect(within(doubles).getByText('MD2')).toBeInTheDocument();
    expect(within(doubles).getByText('WD1')).toBeInTheDocument();
    expect(within(mixed).getByText('Not entered')).toBeInTheDocument();
    expect(within(singles).queryByText('Not entered')).toBeNull();
  });

  it('starts collapsed and expands a category on header click', () => {
    const renderTypeEditor = vi.fn((type: string) => (
      <div data-testid={`editor-${type}`}>{type} editor</div>
    ));
    render(<EventsControl entries={[]} renderTypeEditor={renderTypeEditor} />);
    expect(screen.queryByTestId('editor-MS')).toBeNull();
    expect(renderTypeEditor).not.toHaveBeenCalled();

    const singles = screen.getByTestId('events-category-singles');
    expect(singles).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(singles);
    expect(singles).toHaveAttribute('aria-expanded', 'true');
    // Singles expands to its two type editors, in category order.
    expect(screen.getByTestId('editor-MS')).toBeInTheDocument();
    expect(screen.getByTestId('editor-WS')).toBeInTheDocument();
    // Other categories stay collapsed.
    expect(screen.queryByTestId('editor-MD')).toBeNull();
    expect(screen.queryByTestId('editor-XD')).toBeNull();
  });

  it('collapses again on a second click', () => {
    render(
      <EventsControl
        entries={[]}
        renderTypeEditor={(t) => <div data-testid={`editor-${t}`} />}
      />,
    );
    const mixed = screen.getByTestId('events-category-mixed');
    fireEvent.click(mixed);
    expect(screen.getByTestId('editor-XD')).toBeInTheDocument();
    fireEvent.click(mixed);
    expect(screen.queryByTestId('editor-XD')).toBeNull();
  });

  it('categorizes typed entries by explicit type, not code prefix', () => {
    // Bracket badges relabeled by event id ("MON", "MD2X") carry their
    // event's discipline as `type` — the header summary must group by it
    // (SP-D7 S5 live-verification fix: header undercounted vs row badges).
    render(
      <EventsControl
        entries={[{ code: 'MON', type: 'MS' }, { code: 'MD2X', type: 'MD' }, 'WD1']}
        renderTypeEditor={() => null}
      />,
    );
    const singles = screen.getByTestId('events-category-singles');
    const doubles = screen.getByTestId('events-category-doubles');
    const mixed = screen.getByTestId('events-category-mixed');
    expect(within(singles).getByText('MON')).toBeInTheDocument();
    expect(within(doubles).getByText('MD2X')).toBeInTheDocument();
    expect(within(doubles).getByText('WD1')).toBeInTheDocument();
    expect(within(mixed).getByText('Not entered')).toBeInTheDocument();
  });

  it('honors categoriesOpen as the initial expanded set', () => {
    render(
      <EventsControl
        entries={[]}
        renderTypeEditor={(t) => <div data-testid={`editor-${t}`} />}
        categoriesOpen={['doubles']}
      />,
    );
    expect(screen.getByTestId('editor-MD')).toBeInTheDocument();
    expect(screen.getByTestId('editor-WD')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-MS')).toBeNull();
  });
});

describe('EventBadge', () => {
  it('renders the code', () => {
    render(<EventBadge code="XD2" />);
    expect(screen.getByText('XD2')).toBeInTheDocument();
  });
});
