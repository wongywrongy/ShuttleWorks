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

  /**
   * V2 — the browser pass found the bracket roster panel's EVENTS section
   * reading "1 entered" over three categories all reading "Not entered", and
   * DOUBLES setting `aria-expanded=true` over a 10px div with zero children.
   * Both come from the fixed {MS,WS,MD,WD,XD} table meeting operator-defined
   * disciplines: an entry outside the five belongs to no category while still
   * counting, and a category with no draw behind it opens onto nothing.
   */
  describe('operator-defined disciplines (V2)', () => {
    it('gives an entry outside the five its own category instead of dropping it', () => {
      // The reported state: entered in exactly one event, and every category
      // saying "Not entered". A badge that counts must be a badge you can see.
      render(
        <EventsControl
          entries={[{ code: 'BS1', type: 'BS' }]}
          renderTypeEditor={(t) => <div data-testid={`editor-${t}`} />}
        />,
      );
      const own = screen.getByTestId('events-category-BS');
      expect(within(own).getByText('BS1')).toBeInTheDocument();
      // And it is reachable: expanding offers the editor for that discipline.
      fireEvent.click(own);
      expect(screen.getByTestId('editor-BS')).toBeInTheDocument();
    });

    it('does not render a category whose codes no event declares', () => {
      // `types` is the consumer's real universe. With only a BS draw, Doubles
      // has nothing to offer, so it is absent rather than an inert caret.
      render(
        <EventsControl
          entries={[]}
          types={['BS']}
          renderTypeEditor={(t) => <div data-testid={`editor-${t}`} />}
        />,
      );
      expect(screen.getByTestId('events-category-BS')).toBeInTheDocument();
      expect(screen.queryByTestId('events-category-doubles')).toBeNull();
      expect(screen.queryByTestId('events-category-singles')).toBeNull();
      expect(screen.queryByTestId('events-category-mixed')).toBeNull();
    });

    it('every rendered disclosure opens onto at least one editor', () => {
      // The contract the empty 10px body broke, stated directly: expand every
      // category the component chose to render; each must produce a body.
      render(
        <EventsControl
          entries={[{ code: 'BS1', type: 'BS' }]}
          types={['MS', 'BS']}
          renderTypeEditor={(t) => <div data-testid={`editor-${t}`}>{t}</div>}
        />,
      );
      const headers = screen.getAllByRole('button', { expanded: false });
      expect(headers.length).toBeGreaterThan(0);
      for (const header of headers) {
        fireEvent.click(header);
        const body = header.parentElement?.querySelector(
          '[data-testid^="editor-"]',
        );
        expect(body).not.toBeNull();
      }
    });

    it('narrows a default category to the codes that exist', () => {
      // Singles survives on MS alone; the WS row it has no draw for does not
      // render, so expanding Singles cannot show an empty half.
      render(
        <EventsControl
          entries={[]}
          types={['MS']}
          renderTypeEditor={(t) => <div data-testid={`editor-${t}`} />}
          categoriesOpen={['singles']}
        />,
      );
      expect(screen.getByTestId('editor-MS')).toBeInTheDocument();
      expect(screen.queryByTestId('editor-WS')).toBeNull();
    });
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
