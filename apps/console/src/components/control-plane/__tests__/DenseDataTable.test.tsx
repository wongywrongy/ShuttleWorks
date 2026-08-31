import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Select page" }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(["1"]);
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
