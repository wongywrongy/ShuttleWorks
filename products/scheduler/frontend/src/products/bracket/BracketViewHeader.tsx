import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBracketApi, type BracketApi } from "../../api/bracketClient";
import type { TournamentDTO } from "../../api/bracketDto";
import { Select, StatusBar } from "@scheduler/design-system";
import type { BracketView } from "../../lib/bracketTabs";
import { useTournamentId } from "../../hooks/useTournamentId";
import { INTERACTIVE_BASE } from "../../lib/utils";
import { ActionsBar } from "../../components/control-plane";
import { EventsFilterStrip } from "./EventsFilterStrip";
import { SourceChip } from "../../components/SourceChip";
import { formatLabel, disciplineLabel } from "./bracketLabels";
import { BracketScheduleModal } from "./BracketScheduleModal";

interface Props {
  /** Bare view name — drives the eyebrow. Derived from ``activeTab``
   *  by ``BracketTabBody`` (``bracket-draw`` -> ``draw``). Only the
   *  draw / schedule / live views render this header — Setup, Roster
   *  and Events own their header strips (SettingsShell / tab-local),
   *  mirroring how each meet tab owns its single header baseline. */
  view: Extract<BracketView, "draw" | "schedule" | "live">;
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  /** Re-fetch the bracket after a server-side mutation (schedule-next
   *  returns a solver summary, not the tournament DTO). */
  onRefresh: () => Promise<void>;
}

const VIEW_LABEL: Record<Props["view"], string> = {
  draw: "DRAW",
  schedule: "SCHEDULE",
  live: "LIVE",
};

/**
 * Bracket per-view header strip. Built to the meet's view-header
 * pattern (mirrors ``MatchesTab`` / ``RosterTab``:
 * ``border-b border-border bg-card px-4 py-3``, eyebrow + context on
 * the left, control cluster on the right) so the bracket surface
 * reads with the same chrome rhythm as every meet tab.
 *
 * Per-view right cluster, like the meet (each tab header carries only
 * the controls that act on that tab):
 *   draw     -> event-scoped status counts
 *   schedule -> global status counts + JSON/CSV/ICS exports
 *   live     -> global status counts
 * Reset lives in Setup → Tournament data (destructive actions don't
 * ride along on every view).
 */
export function BracketViewHeader({ view, data, eventId, onEventId, onRefresh }: Props) {
  const api = useBracketApi();
  const tid = useTournamentId();
  const navigate = useNavigate();
  const [scheduling, setScheduling] = useState(false);
  const counts = useMemo(
    () => buckets(data, view === "draw" ? eventId : null),
    [data, view, eventId],
  );

  // Matches whose sides are fully resolved (winners propagated) but
  // that have no court/slot yet — exactly what schedule-next solves.
  // Mirrors the backend's ``find_ready_play_units`` predicate (no
  // result, no assignment, non-empty sides, all dependencies played)
  // so the button never shows when the solver would do nothing.
  // Without this affordance the day dead-ends after round 1.
  const schedulableCount = useMemo(() => {
    const assigned = new Set(data.assignments.map((a) => a.play_unit_id));
    const done = new Set(data.results.map((r) => r.play_unit_id));
    return data.play_units.filter(
      (pu) =>
        !assigned.has(pu.id) &&
        !done.has(pu.id) &&
        pu.side_a != null &&
        pu.side_a.length > 0 &&
        pu.side_b != null &&
        pu.side_b.length > 0 &&
        pu.dependencies.every((dep) => done.has(dep)),
    ).length;
  }, [data]);

  const selectedEvent = data.events.find((e) => e.id === eventId);
  const eventFormatLabel = formatLabel(selectedEvent?.format);

  return (
    <ActionsBar
      title={VIEW_LABEL[view]}
      status={
        <>
          {/* Engine-provenance chip on the Operations surfaces (Courts =
              schedule, Live). Draw is a Bracket-section surface. */}
          {(view === "schedule" || view === "live") && <SourceChip source="bracket" />}
          {view === "draw" ? (
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
            </>
          ) : (
            <EventsFilterStrip />
          )}
        </>
      }
    >
      <span className="font-mono">
        <StatusBar
          items={[
            { tone: "done", label: "DONE", count: counts.done },
            { tone: "green", label: "LIVE", count: counts.live },
            { tone: "amber", label: "READY", count: counts.ready },
            { tone: "idle", label: "PEND", count: counts.pending },
          ]}
        />
      </span>
      {view === "schedule" && <ExportMenu api={api} />}
      {(view === "schedule" || view === "live") && schedulableCount > 0 && (
        <button
          type="button"
          onClick={() => setScheduling(true)}
          disabled={scheduling}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {`Schedule next round (${schedulableCount})`}
        </button>
      )}
      {scheduling && (
        <BracketScheduleModal
          api={api}
          onClose={() => setScheduling(false)}
          onCommitted={onRefresh}
        />
      )}
    </ActionsBar>
  );
}

function ExportMenu({ api }: { api: BracketApi }) {
  return (
    <div className="inline-flex rounded-sm border border-border overflow-hidden text-xs">
      <a
        href={api.exportJsonUrl()}
        target="_blank"
        rel="noreferrer"
        className="px-2 py-1 hover:bg-muted/40"
      >
        JSON
      </a>
      <a
        href={api.exportCsvUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        CSV
      </a>
      <a
        href={api.exportIcsUrl()}
        className="px-2 py-1 border-l border-border hover:bg-muted/40"
      >
        ICS
      </a>
    </div>
  );
}

function buckets(data: TournamentDTO, eventId: string | null) {
  const resultsById = new Set(data.results.map((r) => r.play_unit_id));
  const assignmentByPu = new Map(
    data.assignments.map((a) => [a.play_unit_id, a])
  );
  let done = 0;
  let live = 0;
  let ready = 0;
  let pending = 0;
  for (const pu of data.play_units) {
    if (eventId && pu.event_id !== eventId) continue;
    if (resultsById.has(pu.id)) {
      done += 1;
      continue;
    }
    const a = assignmentByPu.get(pu.id);
    if (a?.started && !a.finished) {
      live += 1;
      continue;
    }
    if (a) {
      ready += 1;
      continue;
    }
    pending += 1;
  }
  return { done, live, ready, pending };
}
