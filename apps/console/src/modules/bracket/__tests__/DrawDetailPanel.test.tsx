import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DrawDetailPanel } from "../DrawDetailPanel";
import type { BracketEventDTO } from "../eventUpsertPayload";
import { formatPlayerName, formatSideName } from "../../../lib/names";

const onClose = vi.fn();
const onCommitPicks = vi.fn().mockResolvedValue(undefined);

const ev: BracketEventDTO = {
  id: "MS",
  discipline: "MS",
  format: "se",
  bracket_size: 4,
  participant_count: 1,
  rounds: [],
  status: "draft",
  participants: [{ id: "p-alex", name: "Alex Tan", seed: 1 }],
} as BracketEventDTO;

const players = [
  // Alex came through the entries commit seam and holds a person key;
  // Ben was hand-added and holds none (R-DM-2(a)).
  { id: "p-alex", name: "Alex Tan", entryPlayerId: "ep-alex" },
  { id: "p-ben", name: "Ben Carter" },
];

/** Enough free names that a doubles fixture can hold entered teams AND
 *  still leave two players for the operator to pair by hand. */
const roster = [
  ...players,
  { id: "p-cara", name: "Cara Diaz" },
  { id: "p-dan", name: "Dan Osei" },
  { id: "p-eve", name: "Eve Novak" },
  { id: "p-fin", name: "Fin Wallace" },
];

/** A doubles draw already holding `participants`. */
const doublesEvent = (
  id: string,
  discipline: string,
  participants: unknown[],
): BracketEventDTO =>
  ({
    ...ev,
    id,
    discipline,
    participant_count: participants.length,
    participants,
  }) as unknown as BracketEventDTO;

/** Form the one pair the roster always leaves free, then save. */
const pairAlexAndBen = () => {
  fireEvent.click(
    screen.getByRole("radio", { name: formatPlayerName("Alex Tan") }),
  );
  fireEvent.click(
    screen.getByRole("radio", { name: formatPlayerName("Ben Carter") }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Save pairs$/i }));
};

beforeEach(() => {
  onClose.mockReset();
  onCommitPicks.mockClear();
});

describe("DrawDetailPanel", () => {
  it("renders only the approved draw identity and configuration summary", () => {
    const eventWithInternalConfig = {
      ...ev,
      config: {
        imported: true,
        record_scope: "full_draw",
        topology_scope: null,
        source_url: "https://internal.example.test/source",
      },
    } as BracketEventDTO;
    render(
      <DrawDetailPanel
        ev={eventWithInternalConfig}
        players={players}
        matchCount={3}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    const panel = screen.getByTestId("draw-detail-panel");
    expect(within(panel).getByText("MS")).toBeInTheDocument();
    expect(within(panel).getByText(/Single elimination/)).toBeInTheDocument();
    expect(within(panel).getByText("Draw size")).toBeInTheDocument();
    expect(within(panel).getByText("4")).toBeInTheDocument();
    expect(within(panel).getByText("Entered")).toBeInTheDocument();
    expect(within(panel).getByText("Matches")).toBeInTheDocument();
    expect(within(panel).getByText("3")).toBeInTheDocument();
    expect(within(panel).queryByText(/record scope/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/full_draw/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/topology/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/internal\.example/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText("true")).not.toBeInTheDocument();
    expect(within(panel).queryByText("null")).not.toBeInTheDocument();
  });

  it("hosts the participant picker and forwards commits", async () => {
    render(
      <DrawDetailPanel
        ev={ev}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    // Options are grouped by initial and sorted: Alex Tan, then Ben Carter.
    fireEvent.click(
      screen.getByRole("checkbox", { name: formatPlayerName("Ben Carter") }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /^Save participants$/i }),
    );
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "p-alex" }),
        expect.objectContaining({ id: "p-ben" }),
      ]),
    );
  });

  // R-DM-2(a): the team row the doubles picker synthesizes is a
  // `bracket_participants` row like any other, so it has to carry the
  // nominating player's key — the same half `members[0]` names.
  it("carries the nominating player entryPlayerId onto a synthesized team", async () => {
    // Empty on purpose: the fixture used to inherit `ev`'s singles
    // participant, which was inert only while the doubles picker threw the
    // draw's existing rows away. Now that it opens holding them, an
    // inherited row would ride into this commit and blur what the pin is
    // about — the key on the team the picker SYNTHESIZES.
    const md = doublesEvent("MD", "MD", []);
    render(
      <DrawDetailPanel
        ev={md}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    pairAlexAndBen();
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    expect(onCommitPicks.mock.calls[0][0]).toEqual([
      {
        id: "MD-T1",
        name: "Alex Tan / Ben Carter",
        members: ["p-alex", "p-ben"],
        entryPlayerId: "ep-alex",
      },
    ]);
  });

  it("opens the DOUBLES picker for a director-defined BD draw", () => {
    /* THE FLIP. Characterized at 70b61bf1 asserting the opposite: the panel
       asked a closed `['MD','WD','XD']` list, so `BD` — doubles by the
       D-suffix convention the product documents as its rule
       (`MeetEventsSection.tsx:15`) and doubles everywhere in Meet — opened
       the SINGLES picker. F-DM-13 collapsed the six doubles rules into
       `lib/doubles.ts::isDoublesCode`, and this is the deliberate,
       user-visible half of that widening (P5 judgment call 6). The
       inversion of this pin is the proof the collapse changed behavior
       rather than just moving a literal. */
    const bd = { ...ev, id: "BD", discipline: "BD" } as BracketEventDTO;
    render(
      <DrawDetailPanel
        ev={bd}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    expect(
      screen.getByRole("button", { name: /^Save pairs$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Save participants$/i }),
    ).not.toBeInTheDocument();
  });

  // Commit REPLACES the event's participants. Opening the picker empty meant
  // ticking one name dropped everyone already entered.
  it("opens holding the participants already entered in the draw", () => {
    render(
      <DrawDetailPanel
        ev={ev}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: formatPlayerName("Alex Tan") }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: formatPlayerName("Ben Carter") }),
    ).not.toBeChecked();
    expect(screen.getByText(/Pick participants \(1\)/i)).toBeInTheDocument();
  });

  /* THE FLIP of `TODAY drops every existing team when a doubles pair is
     committed` (characterized at 8ded73c5), closing debt-log.md:96.
     Commit REPLACES the event's participant list, so a picker that opens
     empty is a delete button wearing a save label — and from P5 onward the
     rows it deletes are the ones the entries commit seam built from two
     humans' agreement. */
  const twoTeams = [
    { id: "XD-T1", name: "Cara Diaz / Dan Osei", members: ["p-cara", "p-dan"] },
    {
      id: "XD-T2",
      name: "Eve Novak / Fin Wallace",
      members: ["p-eve", "p-fin"],
    },
  ];

  it("opens holding the teams already entered in the draw", () => {
    render(
      <DrawDetailPanel
        ev={doublesEvent("XD", "XD", twoTeams)}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    expect(
      screen.getByText(formatSideName("Cara Diaz / Dan Osei")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatSideName("Eve Novak / Fin Wallace")),
    ).toBeInTheDocument();
    // Existing pairs stay visible and legal to override, but their state is
    // explicit and requires the replacement warning before selection.
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Cara Diaz") }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Fin Wallace") }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Alex Tan") }),
    ).not.toBeDisabled();
    expect(screen.getByText(/^Pick player A$/i)).toBeInTheDocument();
  });

  it("routes pair-row actions to the player control and canonical command", () => {
    const onOpenPlayer = vi.fn();
    const onPairCommand = vi.fn().mockResolvedValue(undefined);
    const pair = twoTeams[0];
    render(
      <DrawDetailPanel
        ev={doublesEvent("XD", "XD", [pair])}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
        onOpenPlayer={onOpenPlayer}
        onPairCommand={onPairCommand}
      />,
    );

    const actions = new RegExp(`Actions for ${formatSideName(pair.name)}`);
    fireEvent.click(screen.getByRole("button", { name: actions }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open player" }));
    expect(onOpenPlayer).toHaveBeenCalledWith("p-cara");

    fireEvent.click(screen.getByRole("button", { name: actions }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Change partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(onOpenPlayer).toHaveBeenLastCalledWith("p-cara");

    fireEvent.click(screen.getByRole("button", { name: actions }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Dissolve pair" }));
    expect(onPairCommand).toHaveBeenCalledWith({
      type: "dissolve",
      playerId: "p-cara",
    });
  });

  it("adds a new pair to the existing ones rather than replacing them", async () => {
    render(
      <DrawDetailPanel
        ev={doublesEvent("XD", "XD", twoTeams)}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    pairAlexAndBen();
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toHaveLength(3);
    expect(picks.slice(0, 2)).toEqual(twoTeams);
    expect(picks[2].members).toEqual(["p-alex", "p-ben"]);
  });

  it("numbers a new team past the highest existing suffix", async () => {
    /* `nextTeamId` (rosterEvents.ts:136) already generalizes the picker's
       `{eventId}-T{n}` rule to max-suffix + 1 so a removed pair's number is
       never reused. Seeding from existing teams is what makes that
       generalization reachable from this surface for the first time: with
       only T2 left, sequence numbering would mint a SECOND T2. */
    render(
      <DrawDetailPanel
        ev={doublesEvent("XD", "XD", [twoTeams[1]])}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    pairAlexAndBen();
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    expect(onCommitPicks.mock.calls[0][0][1].id).toBe("XD-T3");
  });

  it("keeps a seam-built team whose id is not the picker numbering", async () => {
    /* The commit seam mints `team-{uuidA}-{uuidB}` (entries/entries.py
       ::team_id) — deterministic, because that seam is re-runnable. It does
       NOT match `{eventId}-T{n}`, so the seed must carry ids through
       verbatim rather than re-deriving them. */
    const seamTeam = {
      id: "team-11111111-1111-1111-1111-111111111111-22222222-2222-2222-2222-222222222222",
      name: "Cara Diaz / Dan Osei",
      members: ["p-cara", "p-dan"],
      entryPlayerId: "ep-cara",
    };
    render(
      <DrawDetailPanel
        ev={doublesEvent("XD", "XD", [seamTeam])}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    pairAlexAndBen();
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks[0]).toEqual(seamTeam);
    // No `-T` suffix to beat, so the hand-added pair starts the numbering.
    expect(picks[1].id).toBe("XD-T1");
  });

  it("keeps a singleton entered in a doubles draw through a re-save", async () => {
    /* F-DM-13 widened `BD` from singles to doubles (`isDoublesCode`), so a
       BD draw whose entrants were committed as PLAYER rows now opens the
       DOUBLES picker. Those rows are not pairs and this two-step picker
       cannot re-form them — but commit replaces the list, so dropping them
       from the seed would delete real entrants on the next save. They ride
       through verbatim; reshaping them into teams would be the picker
       deciding something. */
    const bd = doublesEvent("BD", "BD", [
      { id: "p-cara", name: "Cara Diaz" },
      { id: "p-dan", name: "Dan Osei", entryPlayerId: "ep-dan" },
      // `members: []` is the third shape the wire admits (bracketDto.ts:23),
      // and the module already reads it as "this row's id IS the person"
      // (rosterEvents.ts:79). It is truthy AND non-nullish, so a `??` guard
      // lets it contribute NOBODY to `unavailable` and Eve stays pickable
      // into a second row.
      { id: "p-eve", name: "Eve Novak", members: [] },
    ]);
    render(
      <DrawDetailPanel
        ev={bd}
        players={roster}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    // A carried singleton's own id IS its player id, so it must block that
    // player too — otherwise one save enters them twice.
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Cara Diaz") }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("radio", { name: formatPlayerName("Eve Novak") }),
    ).not.toBeDisabled();
    pairAlexAndBen();
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toHaveLength(4);
    expect(picks[0]).toEqual({ id: "p-cara", name: "Cara Diaz" });
    expect(picks[1]).toEqual({
      id: "p-dan",
      name: "Dan Osei",
      entryPlayerId: "ep-dan",
    });
    // Verbatim: an empty members list is NOT reshaped to PLAYER form on the
    // way back out — the seed carries what the row said.
    expect(picks[2]).toEqual({ id: "p-eve", name: "Eve Novak", members: [] });
  });

  it("renders the roster as one strict record row per player", () => {
    render(
      <DrawDetailPanel
        ev={ev}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    const picker = screen.getByTestId("participant-picker-table");
    const table = picker.querySelector('[data-strict-record-table="true"]');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('[data-strict-row="true"]')).toHaveLength(
      players.length,
    );
    expect(table?.querySelector('[data-strict-row="true"]')).toHaveClass(
      "h-7",
      "max-h-7",
    );
    expect(table?.querySelector('[data-strict-cell="true"]')).toHaveClass(
      "whitespace-nowrap",
      "text-ellipsis",
    );
  });

  it("closes via the panel close button", () => {
    render(
      <DrawDetailPanel
        ev={ev}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Close detail/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the participant picker's own Cancel button", () => {
    render(
      <DrawDetailPanel
        ev={ev}
        players={players}
        onClose={onClose}
        onCommitPicks={onCommitPicks}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
