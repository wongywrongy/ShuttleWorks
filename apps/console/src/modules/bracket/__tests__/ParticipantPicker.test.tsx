import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { BracketPlayerDTO } from "../../../api/dto";
import { formatPlayerName, formatSideName } from "../../../lib/names";
import {
  ParticipantPicker,
  type PickedPair,
  type PickedSingle,
} from "../ParticipantPicker";

const players = [
  { id: "p-a", name: "Alex Tan" },
  { id: "p-b", name: "Beth Longname That Must Stay On One Line" },
  { id: "p-c", name: "Cara Diaz" },
] as BracketPlayerDTO[];

const noOp = () => undefined;

describe("ParticipantPicker strict record tables", () => {
  it("opens a 252-player candidate set from one loaded snapshot", () => {
    const largeRoster = Array.from({ length: 252 }, (_, index) => ({
      id: `p-${index + 1}`,
      name: `Player ${String(index + 1).padStart(3, "0")} Carter`,
    })) as BracketPlayerDTO[];
    const onCommit = vi.fn();

    render(
      <ParticipantPicker
        mode="doubles"
        eventId="MD"
        players={largeRoster}
        initialIds={[]}
        initialPairs={[]}
        onCommit={onCommit}
        onCancel={noOp}
      />,
    );

    const picker = screen.getByTestId("participant-picker-table");
    // The primitive renders one page, but search filters the complete loaded
    // snapshot client-side; no per-row fetch or hidden legal candidate.
    expect(picker.querySelectorAll('[data-strict-row="true"]')).toHaveLength(50);
    fireEvent.change(screen.getByPlaceholderText("Search players"), {
      target: { value: "Player 252" },
    });
    expect(picker.querySelectorAll('[data-strict-row="true"]')).toHaveLength(1);
    expect(
      screen.getByText(formatPlayerName("Player 252 Carter")),
    ).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("renders one strict row per candidate and preserves selection/save behavior", () => {
    const onCommit = vi.fn<(picks: PickedSingle[]) => void>();
    render(
      <ParticipantPicker
        mode="singles"
        eventId="MS"
        players={players}
        initialIds={["p-a"]}
        initialPairs={[]}
        onCommit={onCommit}
        onCancel={noOp}
      />,
    );

    const picker = screen.getByTestId("participant-picker-table");
    const table = picker.querySelector('[data-strict-record-table="true"]');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('[data-strict-row="true"]')).toHaveLength(
      players.length,
    );
    expect(table?.querySelectorAll('[data-strict-cell="true"]')).toHaveLength(
      players.length,
    );
    expect(screen.queryByText(/Page 1/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: formatPlayerName("Alex Tan") }),
    ).toBeChecked();

    const longRow = screen.getByRole("row", {
      name: new RegExp(formatPlayerName("Beth Longname That Must Stay On One Line")),
    });
    expect(longRow).toHaveClass("h-7", "max-h-7");
    expect(longRow.querySelector('[data-strict-cell="true"]')).toHaveClass(
      "whitespace-nowrap",
      "text-ellipsis",
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: new RegExp(formatPlayerName("Beth Longname That Must Stay On One Line")),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save participants" }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "p-a" }),
        expect.objectContaining({ id: "p-b" }),
      ]),
    );
  });

  it("renders existing pairs through the same strict primitive, one row per pair", () => {
    const pairs: PickedPair[] = [
      {
        id: "MD-T1",
        name: "Alex Tan / Beth Longname That Must Stay On One Line",
        members: ["p-a", "p-b"],
      },
      { id: "MD-T2", name: "Cara Diaz / Alex Tan", members: ["p-c", "p-a"] },
    ];

    render(
      <ParticipantPicker
        mode="doubles"
        eventId="MD"
        players={players}
        initialIds={[]}
        initialPairs={pairs}
        onCommit={vi.fn()}
        onCancel={noOp}
      />,
    );

    const pairTable = screen.getByTestId("participant-pairs-table");
    const table = pairTable.querySelector('[data-strict-record-table="true"]');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('[data-strict-row="true"]')).toHaveLength(
      pairs.length,
    );
    expect(table?.querySelectorAll('[data-strict-cell="true"]')).toHaveLength(
      pairs.length,
    );
    expect(table?.querySelector('[data-strict-cell="true"]')).toHaveClass(
      "whitespace-nowrap",
      "text-ellipsis",
    );
    expect(screen.queryByText(/Page 1/i)).not.toBeInTheDocument();
  });

  it("ranks event singletons first, then new players, while keeping paired players visible", () => {
    const doublesPlayers = [
      { id: "p-new", name: "New Player" },
      { id: "p-singleton", name: "Singleton Player" },
      { id: "p-pa", name: "Paired Alpha" },
      { id: "p-pb", name: "Paired Beta" },
    ] as BracketPlayerDTO[];
    render(
      <ParticipantPicker
        mode="doubles"
        eventId="XD"
        players={doublesPlayers}
        initialIds={[]}
        initialPairs={[
          { id: "p-singleton", name: "Singleton Player" },
          {
            id: "XD-T1",
            name: "Paired Alpha / Paired Beta",
            members: ["p-pa", "p-pb"],
          },
        ]}
        onCommit={vi.fn()}
        onCancel={noOp}
      />,
    );

    const candidateTable = screen.getByTestId("participant-picker-table");
    const rows = [...candidateTable.querySelectorAll<HTMLElement>("tbody tr")];
    expect(rows.map((row) => row.getAttribute("data-row-id"))).toEqual([
      "p-singleton",
      "p-new",
      "p-pa",
      "p-pb",
    ]);
    expect(within(rows[1]).getByText("Not entered")).toBeInTheDocument();
    expect(
      within(rows[2]).getByText(`Paired with ${formatPlayerName("Paired Beta")}`),
    ).toBeInTheDocument();
    expect(
      within(rows[3]).getByText(`Paired with ${formatPlayerName("Paired Alpha")}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Paired Alpha") }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Paired Beta") }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Singleton Player") }),
    ).not.toBeDisabled();
    expect(within(rows[0]).getByText("Entered")).toBeInTheDocument();
  });

  it("limits assignment to two picks and one save confirmation", () => {
    const onCommit = vi.fn<(picks: PickedPair[]) => void>();
    render(
      <ParticipantPicker
        mode="doubles"
        eventId="XD"
        players={players}
        initialIds={[]}
        initialPairs={[]}
        onCommit={onCommit}
        onCancel={noOp}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: formatPlayerName("Alex Tan") }),
    );
    fireEvent.click(
      screen.getByRole("radio", {
        name: new RegExp(formatPlayerName("Beth Longname That Must Stay On One Line")),
      }),
    );
    const formattedPair = formatSideName(
      "Alex Tan / Beth Longname That Must Stay On One Line",
      " / ",
    );
    expect(screen.queryByText(formattedPair)).not.toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save pairs" }));
    expect(onCommit).toHaveBeenCalledWith([
      expect.objectContaining({ members: ["p-a", "p-b"] }),
    ]);
  });

  it("warns before replacing a pair and exposes all pair actions through callbacks", () => {
    const onOpenPlayer = vi.fn();
    const onChangePartner = vi.fn();
    const onDissolvePair = vi.fn();
    const pair: PickedPair = {
      id: "XD-T1",
      name: "Alex Tan / Beth Longname That Must Stay On One Line",
      members: ["p-a", "p-b"],
    };
    render(
      <ParticipantPicker
        mode="doubles"
        eventId="XD"
        players={players}
        initialIds={[]}
        initialPairs={[pair]}
        onCommit={vi.fn()}
        onCancel={noOp}
        onOpenPlayer={onOpenPlayer}
        onChangePartner={onChangePartner}
        onDissolvePair={onDissolvePair}
      />,
    );

    const actionName = new RegExp(
      `Actions for ${formatSideName(pair.name, " / ")}`,
    );
    fireEvent.click(screen.getByRole("button", { name: actionName }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open player" }));
    expect(onOpenPlayer).toHaveBeenCalledWith("p-a");

    fireEvent.click(screen.getByRole("button", { name: actionName }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Dissolve pair" }));
    expect(onDissolvePair).toHaveBeenCalledWith(pair);

    fireEvent.click(screen.getByRole("button", { name: actionName }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Change partner" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/will replace/);
    expect(onChangePartner).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(onChangePartner).toHaveBeenCalledWith(pair);
  });
});
