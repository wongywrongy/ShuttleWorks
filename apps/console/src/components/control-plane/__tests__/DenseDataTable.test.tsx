import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DenseDataTable } from "../DenseDataTable";
import { DEFAULT_DENSE_DATA_STATE, type DenseDataColumn } from "../denseData";

interface Row {
  id: string;
  name: string;
  status: string;
  count?: number | null;
}
const columns: DenseDataColumn<Row>[] = [
  { id: "name", label: "Name", accessor: (row) => row.name },
  { id: "status", label: "Status", accessor: (row) => row.status },
];
const rows: Row[] = [{ id: "1", name: "Mina", status: "Ready" }];

describe("DenseDataTable", () => {
  it("exposes semantic sortable headers and aria-sort", () => {
    const onStateChange = vi.fn();
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={onStateChange}
        rowId={(row) => row.id}
      />,
    );
    const name = screen.getByRole("columnheader", { name: /name/i });
    expect(name).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: /name: sort/i }));
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: { id: "name", direction: "asc" } }),
    );
  });

  it("selects visible page rows and reports selected state", () => {
    const onSelectedIdsChange = vi.fn();
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        selectable
        onSelectedIdsChange={onSelectedIdsChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select these 1" }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(["1"]);
  });

  it('shows the page-size selector and numbered navigation for multiple pages', () => {
    const manyRows = Array.from({ length: 26 }, (_, index) => ({
      id: String(index + 1), name: `Player ${index + 1}`, status: 'Ready',
    }));
    const onStateChange = vi.fn();
    render(
      <DenseDataTable
        rows={manyRows}
        columns={columns}
        state={{ ...DEFAULT_DENSE_DATA_STATE, pageSize: 25 }}
        onStateChange={onStateChange}
        rowId={(row) => row.id}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25');
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } });
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }));
  });

  it('keeps a 101-record inventory at the 100-row default and reaches page two', () => {
    const inventory = Array.from({ length: 101 }, (_, index) => ({
      id: `player-${index + 1}`,
      name: index === 100 ? 'Late Match Player' : `Player ${index + 1}`,
      status: 'Ready',
    }));
    const onStateChange = vi.fn();
    const state = { ...DEFAULT_DENSE_DATA_STATE, pageSize: 100 as const };
    const { rerender } = render(
      <DenseDataTable
        rows={inventory}
        columns={columns}
        state={state}
        onStateChange={onStateChange}
        rowId={(row) => row.id}
        rowTestId={(row) => `inventory-${row.id}`}
      />,
    );
    expect(screen.getAllByTestId(/^inventory-/)).toHaveLength(100);
    expect(screen.queryByText('Late Match Player')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 100 }));
    rerender(
      <DenseDataTable
        rows={inventory}
        columns={columns}
        state={{ ...state, page: 2 }}
        onStateChange={onStateChange}
        rowId={(row) => row.id}
        rowTestId={(row) => `inventory-${row.id}`}
      />,
    );
    expect(screen.getAllByTestId(/^inventory-/)).toHaveLength(1);
    expect(screen.getByText('Late Match Player')).toBeInTheDocument();
  });

  it('searches the complete inventory beyond page one and selects only visible page rows', () => {
    const inventory = Array.from({ length: 101 }, (_, index) => ({
      id: `match-${index + 1}`,
      name: index === 100 ? 'Target Match 101' : `Match ${index + 1}`,
      status: 'Ready',
    }));
    const onSelectedIdsChange = vi.fn();
    render(
      <DenseDataTable
        rows={inventory}
        columns={columns}
        state={{ ...DEFAULT_DENSE_DATA_STATE, pageSize: 100 as const, search: 'Target Match 101' }}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        selectable
        onSelectedIdsChange={onSelectedIdsChange}
      />,
    );
    expect(screen.getByText('Target Match 101')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select these 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select these 1' }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(['match-101']);
  });

  it('omits pagination navigation when the filtered collection fits one page', () => {
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={{ ...DEFAULT_DENSE_DATA_STATE, pageSize: 25 }}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it("renders the mobile representation with an accessible row action", () => {
    const onRowClick = vi.fn();
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        rowTestId={(row) => `row-${row.id}`}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("row-1"), { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('renders a ReactNode first column on a 390px mobile surface without stringifying it', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const mobileColumns: DenseDataColumn<Row>[] = [
      {
        id: 'name',
        label: 'Name',
        accessor: (row) => row.name,
        render: (_value, row) => <span data-testid="node-name">{row.name}</span>,
      },
      ...columns.slice(1),
    ];
    try {
      render(
        <DenseDataTable
          rows={rows}
          columns={mobileColumns}
          state={DEFAULT_DENSE_DATA_STATE}
          onStateChange={vi.fn()}
          rowId={(row) => row.id}
        />,
      );
      await waitFor(() => expect(document.querySelector('article')).not.toBeNull());
      const mobileArticle = document.querySelector('article');
      expect(mobileArticle).not.toBeNull();
      expect(within(mobileArticle as HTMLElement).getByTestId('node-name')).toHaveTextContent('Mina');
      expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps a nested row action from also opening the row", () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        onRowClick={onRowClick}
        renderActions={() => (
          <button type="button" onClick={onAction}>
            Edit
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("enforces the strict one-record/one-line table contract", () => {
    const strictColumns: DenseDataColumn<Row>[] = [
      { id: "name", label: "Name", accessor: (row) => row.name },
      {
        id: "count",
        label: "Count",
        accessor: (row) => row.count,
        align: "right",
      },
    ];
    const strictRows: Row[] = [
      {
        id: "long",
        name: "A very long operator identity that must remain one line",
        status: "Ready",
        count: null,
      },
      { id: "two", name: "Second", status: "Ready", count: 12 },
    ];

    render(
      <DenseDataTable
        rows={strictRows}
        columns={strictColumns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        rowTestId={(row) => `strict-row-${row.id}`}
        strictRows
        elasticColumnId="name"
        groupBy={() => ({ key: "ignored", label: "Ignored group" })}
        renderActions={() => <button type="button">More</button>}
      />,
    );

    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("data-strict-record-table", "true");
    expect(table.querySelectorAll('[data-strict-row="true"]')).toHaveLength(2);
    expect(
      table.querySelectorAll('[data-strict-cell][data-elastic-column]'),
    ).toHaveLength(2);
    expect(
      table.querySelectorAll('[data-strict-header][data-elastic-column]'),
    ).toHaveLength(1);
    expect(screen.queryByText("Ignored group")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByTestId("strict-row-long")).toHaveClass("h-7", "max-h-7");
    expect(screen.getByTestId("strict-row-long")).toHaveTextContent("—");
    expect(screen.getByTestId("strict-row-two")).toHaveAttribute("data-strict-row", "true");
    expect(table.querySelectorAll('[data-strict-action="true"]')).toHaveLength(2);
    expect(table.querySelector("td[data-elastic-column='name']")).toHaveClass("min-w-0");
    expect(table.querySelector("td[data-strict-cell][class*='sw-num']")).toBeTruthy();
    expect(table.querySelectorAll('[data-strict-cell]')).toHaveLength(4);
  });

  it("defaults the strict elastic column to the first visible column", () => {
    render(
      <DenseDataTable
        rows={rows}
        columns={columns}
        state={DEFAULT_DENSE_DATA_STATE}
        onStateChange={vi.fn()}
        rowId={(row) => row.id}
        strictRows
      />,
    );

    expect(
      screen.getByRole("cell", { name: "Mina" }),
    ).toHaveAttribute("data-elastic-column", "name");
    expect(
      screen.getByRole("cell", { name: "Ready" }),
    ).not.toHaveAttribute("data-elastic-column");
  });
});
