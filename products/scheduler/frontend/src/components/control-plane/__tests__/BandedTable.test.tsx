import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BandedTable, type BandedTableColumn } from '../BandedTable';

interface Row {
  id: string;
  name: string;
}

const COLUMNS: BandedTableColumn[] = [
  { label: '#', className: 'w-8' },
  { label: 'Name', className: 'min-w-0 flex-1' },
];

const ROWS: Row[] = [
  { id: 'r1', name: 'Kim' },
  { id: 'r2', name: 'Novak' },
];

const baseProps = {
  columns: COLUMNS,
  rowId: (r: Row) => r.id,
  renderRow: (r: Row) => <span>{r.name}</span>,
  rowTestId: (r: Row) => `row-${r.id}`,
};

describe('BandedTable', () => {
  it('renders the single-tier column header row', () => {
    render(<BandedTable {...baseProps} rows={ROWS} />);
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('applies container-query priority classes to header cells', () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: '#', className: 'w-8', priority: 2 },
          { label: 'Name', className: 'min-w-0 flex-1' },
        ]}
        rows={[]}
      />,
    );
    // jsdom can't evaluate the container query — pin the classes.
    expect(screen.getByText('#').className).toContain('hidden @2xl/table:block');
    expect(screen.getByText('Name').className).not.toContain('hidden');
  });

  it('two-tier header priority cells restore to flex (label stacking)', () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: '#', className: 'w-8', priority: 2 },
          { label: 'MD', subLabel: 'doubles', className: 'w-20' },
        ]}
        rows={[]}
      />,
    );
    // Two-tier cells wrap the label in an inner span; the priority class
    // sits on the outer cell.
    expect(screen.getByText('#').parentElement?.className).toContain(
      'hidden @2xl/table:flex',
    );
  });

  it('renders a two-tier header when any column has a subLabel', () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: '#', className: 'w-8' },
          { label: 'MD', subLabel: 'doubles', className: 'w-20' },
        ]}
        rows={[]}
      />,
    );
    expect(screen.getByText('MD')).toBeInTheDocument();
    expect(screen.getByText('doubles')).toBeInTheDocument();
  });

  it('renders flat rows via renderRow', () => {
    render(<BandedTable {...baseProps} rows={ROWS} />);
    expect(screen.getByTestId('row-r1')).toHaveTextContent('Kim');
    expect(screen.getByTestId('row-r2')).toHaveTextContent('Novak');
  });

  it('renders grouped rows with band headers and counts, collapsible', () => {
    render(
      <BandedTable
        {...baseProps}
        groups={[
          { key: 'ms', label: "Men's Singles", code: 'MS', items: [ROWS[0]], testId: 'group-ms' },
          { key: 'ws', label: "Women's Singles", items: [ROWS[1]], testId: 'group-ws' },
        ]}
      />,
    );
    const msHeader = screen.getByTestId('group-ms');
    expect(msHeader).toHaveTextContent("Men's Singles");
    expect(msHeader).toHaveTextContent('MS');
    expect(msHeader).toHaveTextContent('1');
    expect(msHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('row-r1')).toBeInTheDocument();

    fireEvent.click(msHeader);
    expect(msHeader).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('row-r1')).toBeNull();
    // Other group unaffected.
    expect(screen.getByTestId('row-r2')).toBeInTheDocument();

    fireEvent.click(msHeader);
    expect(screen.getByTestId('row-r1')).toBeInTheDocument();
  });

  it('fires onRowClick with the row item', () => {
    const onRowClick = vi.fn();
    render(<BandedTable {...baseProps} rows={ROWS} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByTestId('row-r2'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it('marks the selected row via selectedId', () => {
    render(<BandedTable {...baseProps} rows={ROWS} selectedId="r1" />);
    expect(screen.getByTestId('row-r1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('row-r2')).not.toHaveAttribute('data-selected');
  });

  it('applies per-row extra classes via rowClassName', () => {
    render(
      <BandedTable
        {...baseProps}
        rows={ROWS}
        rowClassName={(r) => (r.id === 'r1' ? 'group' : undefined)}
      />,
    );
    expect(screen.getByTestId('row-r1').className).toContain('group');
    expect(screen.getByTestId('row-r2').className).not.toContain('group');
  });
});
