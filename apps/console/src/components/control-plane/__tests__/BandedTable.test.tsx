import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BandedTable, type BandedTableColumn } from "../BandedTable";

interface Row {
  id: string;
  name: string;
}

const COLUMNS: BandedTableColumn[] = [
  { label: "#", className: "w-8" },
  { label: "Name", className: "min-w-0 flex-1" },
];

const ROWS: Row[] = [
  { id: "r1", name: "Kim" },
  { id: "r2", name: "Novak" },
];

const baseProps = {
  columns: COLUMNS,
  rowId: (r: Row) => r.id,
  renderRow: (r: Row) => <span>{r.name}</span>,
  rowTestId: (r: Row) => `row-${r.id}`,
};

describe("BandedTable", () => {
  it("renders the single-tier column header row", () => {
    render(<BandedTable {...baseProps} rows={ROWS} />);
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("applies container-query priority classes to header cells", () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: "#", className: "w-8", priority: 2 },
          { label: "Name", className: "min-w-0 flex-1" },
        ]}
        rows={[]}
      />,
    );
    // jsdom can't evaluate the container query — pin the classes.
    expect(screen.getByText("#").className).toContain(
      "hidden @2xl/table:block",
    );
    expect(screen.getByText("Name").className).not.toContain("hidden");
  });

  it("two-tier header priority cells restore to flex (label stacking)", () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: "#", className: "w-8", priority: 2 },
          { label: "MD", subLabel: "doubles", className: "w-20" },
        ]}
        rows={[]}
      />,
    );
    // Two-tier cells wrap the label in an inner span; the priority class
    // sits on the outer cell.
    expect(screen.getByText("#").parentElement?.className).toContain(
      "hidden @2xl/table:flex",
    );
  });

  it("renders a two-tier header when any column has a subLabel", () => {
    render(
      <BandedTable
        {...baseProps}
        columns={[
          { label: "#", className: "w-8" },
          { label: "MD", subLabel: "doubles", className: "w-20" },
        ]}
        rows={[]}
      />,
    );
    expect(screen.getByText("MD")).toBeInTheDocument();
    expect(screen.getByText("doubles")).toBeInTheDocument();
  });

  it("renders flat rows via renderRow", () => {
    render(<BandedTable {...baseProps} rows={ROWS} />);
    expect(screen.getByTestId("row-r1")).toHaveTextContent("Kim");
    expect(screen.getByTestId("row-r2")).toHaveTextContent("Novak");
  });

  it("renders grouped rows with band headers and counts, collapsible", () => {
    render(
      <BandedTable
        {...baseProps}
        groups={[
          {
            key: "ms",
            label: "Men's Singles",
            code: "MS",
            items: [ROWS[0]],
            testId: "group-ms",
          },
          {
            key: "ws",
            label: "Women's Singles",
            items: [ROWS[1]],
            testId: "group-ws",
          },
        ]}
      />,
    );
    const msHeader = screen.getByTestId("group-ms");
    expect(msHeader).toHaveTextContent("Men's Singles");
    expect(msHeader).toHaveTextContent("MS");
    expect(msHeader).toHaveTextContent("1");
    expect(msHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("row-r1")).toBeInTheDocument();

    fireEvent.click(msHeader);
    expect(msHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("row-r1")).toBeNull();
    // Other group unaffected.
    expect(screen.getByTestId("row-r2")).toBeInTheDocument();

    fireEvent.click(msHeader);
    expect(screen.getByTestId("row-r1")).toBeInTheDocument();
  });

  it("keeps singleton groups flat when their band is suppressed", () => {
    render(
      <BandedTable
        {...baseProps}
        groups={[
          {
            key: "ms",
            label: "Men's Singles",
            code: "MS",
            items: [ROWS[0]],
            testId: "group-ms",
            showBand: false,
          },
          {
            key: "ws",
            label: "Women's Singles",
            code: "WS",
            items: [ROWS[1]],
            testId: "group-ws",
          },
        ]}
      />,
    );

    expect(screen.queryByTestId("group-ms")).toBeNull();
    expect(screen.getByTestId("row-r1")).toBeInTheDocument();
    expect(screen.getByTestId("group-ws")).toBeInTheDocument();
    expect(screen.getByTestId("row-r2")).toBeInTheDocument();
  });

  // V5 — the band printed its short code AND its long name, and every caller
  // resolves the long name with `?? code`. An event with no long name (every
  // operator-defined code) therefore had the same string in both slots and
  // the header read "BS BS 20" / "MDC MDC 1" beside a correct
  // "XD MIXED DOUBLES 11".
  it("prints a band code once when it is also the label", () => {
    render(
      <BandedTable
        {...baseProps}
        groups={[
          {
            key: "bs",
            label: "BS",
            code: "BS",
            items: ROWS,
            testId: "group-bs",
          },
        ]}
      />,
    );
    const header = screen.getByTestId("group-bs");
    // The visible text is the code, the count, and nothing else.
    expect(header.textContent?.match(/BS/g)).toHaveLength(1);
    expect(header).toHaveTextContent("2");
  });

  it("still prints both when the label is a real long name", () => {
    render(
      <BandedTable
        {...baseProps}
        groups={[
          {
            key: "xd",
            label: "Mixed Doubles",
            code: "XD",
            items: ROWS,
            testId: "group-xd",
          },
        ]}
      />,
    );
    const header = screen.getByTestId("group-xd");
    expect(header).toHaveTextContent("XD");
    expect(header).toHaveTextContent("Mixed Doubles");
  });

  it("fires onRowClick with the row item", () => {
    const onRowClick = vi.fn();
    render(<BandedTable {...baseProps} rows={ROWS} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByTestId("row-r2"));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it("keeps a nested action click with the action", () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <BandedTable
        {...baseProps}
        rows={ROWS}
        onRowClick={onRowClick}
        renderRow={(row) => (
          <button type="button" onClick={onAction}>
            Edit {row.name}
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Kim" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("marks the selected row via selectedId", () => {
    render(<BandedTable {...baseProps} rows={ROWS} selectedId="r1" />);
    expect(screen.getByTestId("row-r1")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("row-r2")).not.toHaveAttribute("data-selected");
  });

  it("applies per-row extra classes via rowClassName", () => {
    render(
      <BandedTable
        {...baseProps}
        rows={ROWS}
        rowClassName={(r) => (r.id === "r1" ? "group" : undefined)}
      />,
    );
    expect(screen.getByTestId("row-r1").className).toContain("group");
    expect(screen.getByTestId("row-r2").className).not.toContain("group");
  });
});

// Table semantics (design audit T7, WCAG 1.3.1).
//
// The banded surfaces are the app's data-dense reading views — Meet Matches,
// the rosters, the Entries desk — and were built entirely from div/span/button.
// A screen reader got a flat run of text: no table, no rows, no link between
// an entrant and their state. `PositionGrid` already uses a real
// table/thead/th/td, so the pattern was known and simply wasn't applied to the
// shared primitive.
const CELL_ROWS = {
  ...baseProps,
  renderRow: (r: Row) => (
    <>
      <span role="cell">{r.id.slice(1)}</span>
      <span role="cell">{r.name}</span>
    </>
  ),
};

describe("BandedTable table semantics", () => {
  it("is a table whose header row carries one columnheader per column", () => {
    render(<BandedTable {...CELL_ROWS} rows={ROWS} />);
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((c) => c.textContent),
    ).toEqual(["#", "Name"]);
  });

  it("two-tier headers are columnheaders too", () => {
    render(
      <BandedTable
        {...CELL_ROWS}
        columns={[
          { label: "#", className: "w-8" },
          { label: "MD", subLabel: "doubles", className: "w-20" },
        ]}
        rows={ROWS}
      />,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("links each row to its cells", () => {
    render(<BandedTable {...CELL_ROWS} rows={ROWS} />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 data rows
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "Kim"]);
  });

  it("a selectable row is a selected ROW, not a button that eats its cells", () => {
    const onRowClick = vi.fn();
    render(
      <BandedTable
        {...CELL_ROWS}
        rows={ROWS}
        onRowClick={onRowClick}
        selectedId="r1"
      />,
    );
    // role="button" is a name-from-content role: it collapses every cell in
    // the row into one label, which is the flat run of text the audit found.
    const row = screen.getByTestId("row-r1");
    expect(row).toHaveAttribute("role", "row");
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("row-r2")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(within(row).getAllByRole("cell")).toHaveLength(2);
    // …and the row keeps the keyboard contract it had as a button.
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it("a group band is a row in its own rowgroup, spanning the columns", () => {
    render(
      <BandedTable
        {...CELL_ROWS}
        groups={[
          {
            key: "ms",
            label: "Men's Singles",
            items: [ROWS[0]],
            testId: "group-ms",
          },
        ]}
      />,
    );
    // header rowgroup + the group's rowgroup
    expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
    const band = screen.getByTestId("group-ms").closest('[role="cell"]');
    expect(band).not.toBeNull();
    expect(band).toHaveAttribute("aria-colspan", "2");
  });

  it("keeps the container-query column priorities on header cells", () => {
    render(
      <BandedTable
        {...CELL_ROWS}
        columns={[
          { label: "#", className: "w-8", priority: 2 },
          { label: "Name", className: "min-w-0 flex-1" },
        ]}
        rows={ROWS}
      />,
    );
    const [first, second] = screen.getAllByRole("columnheader");
    expect(first.className).toContain("hidden @2xl/table:block");
    expect(second.className).not.toContain("hidden");
  });
});
