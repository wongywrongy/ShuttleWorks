import { useNavigate } from "react-router-dom";
import type { TournamentDTO } from "../../api/bracketDto";
import { Select } from "@scheduler/design-system";
import { useTournamentId } from "../../hooks/useTournamentId";
import { INTERACTIVE_BASE } from "../../lib/utils";
import { ActionsBar } from "../../components/control-plane";
import { Seg, type SegOption } from "../../platform/engine-config/SettingsControls";
import { formatLabel, disciplineLabel } from "./bracketLabels";
import { descriptorFor } from "./formatRegistry";
import type { BracketLayoutMode } from "./DrawView";

const LAYOUT_OPTIONS: readonly SegOption<BracketLayoutMode>[] = [
  { value: "one-sided", label: "One-sided" },
  { value: "mirrored", label: "Mirrored" },
];

interface Props {
  /** Draw only since SP-CONSOLE-4 B4 — the bracket schedule/live views
   *  retired onto the unified Operations Plan/Run surfaces, so this header
   *  now serves the Draw canvas alone. */
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  /** SE canvas layout — owned by ``BracketTabBody`` alongside ``eventId``
   *  so the toggle survives view switches. Session-only, no persistence. */
  drawLayout?: BracketLayoutMode;
  onDrawLayout?: (mode: BracketLayoutMode) => void;
}

/**
 * Bracket Draw header strip. Built to the meet's view-header pattern
 * (eyebrow + context left, control cluster right) so the bracket surface
 * reads with the same chrome rhythm as every meet tab. The draw tally
 * renders inside the canvas toolbar strip instead (DRAW-2).
 */
export function BracketViewHeader({
  data,
  eventId,
  onEventId,
  drawLayout,
  onDrawLayout,
}: Props) {
  const tid = useTournamentId();
  const navigate = useNavigate();

  const selectedEvent = data.events.find((e) => e.id === eventId);
  const eventFormatLabel = formatLabel(selectedEvent?.format);

  return (
    <ActionsBar
      title="Draw"
      status={
        <>
          {/* The Draw canvas is reached by opening a row on the Draws
              surface (no sidebar entry of its own), so it carries an
              explicit way back rather than stranding the operator. */}
          <button
            type="button"
            onClick={() => navigate(`/tournaments/${tid}/bracket-draws`)}
            className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-card px-2 text-xs text-card-foreground hover:bg-muted/40`}
          >
            ← Draws
          </button>
          <Select
            value={eventId}
            onValueChange={(v) => v && onEventId(v)}
            ariaLabel="Event"
            size="sm"
            mono
            options={data.events.map((e) => ({
              value: e.id,
              label: `${e.id} · ${disciplineLabel(e.discipline)}`,
            }))}
          />
          {selectedEvent && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {eventFormatLabel}
            </span>
          )}
          {/* Layout toggle — bracket-renderer draws only (grid/segments/
              swiss own their layouts). One-sided is the classic printed
              cascade and the default; mirrored stays as the wall-display
              option. */}
          {descriptorFor(selectedEvent?.format)?.renderer === "bracket" &&
            drawLayout &&
            onDrawLayout && (
            <Seg
              options={LAYOUT_OPTIONS}
              value={drawLayout}
              onChange={onDrawLayout}
              ariaLabel="Bracket layout"
              // Toolbar, not a settings row: sized by its own labels.
              fill={false}
            />
          )}
        </>
      }
    />
  );
}
