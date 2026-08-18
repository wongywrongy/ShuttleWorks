/**
 * Match detail pane — the right-docked drawer a clicked match row opens, and
 * since the console-IA pass (§0, §1, §4) the place a match is EDITED.
 *
 * It used to be read-only while every row carried a live Select, a text
 * input, four player buttons and five delete buttons, each calling
 * `stopPropagation` specifically so the row click could not open this pane.
 * The row was the editor; this was a viewer of it. That is now the other way
 * round: the row is a readable summary, and Event / Side A / Side B are
 * edited here, under `DetailPanel.Section` headings.
 *
 * The 74-option flat ungrouped Select with no search is gone with it — the
 * event is chosen through the shared `EventPicker`, grouped by the RAW event
 * prefix (never a fixed discipline table), searched past ten options, with
 * each event's entry count in `meta`.
 *
 * No Slots field: a match takes exactly ONE slot — duration is not a
 * per-match knob (product rule, 2026-07-02).
 */
import { useMemo, useRef, useState } from 'react';
import {
  DetailPanel,
  EventPicker,
  MatchCard,
  PickerPopover,
  setsWinner,
  STATUS_LABEL,
  STATUS_PILL_TONE,
  type EventPickerOption,
  type MatchListStatus,
} from '../../../components/control-plane';
import { StatusPill } from '../../../components/StatusPill';
import { Row } from '../../../platform/settings/SettingsControls';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { formatPlayerName } from '../../../lib/names';
import { slotToTime } from '../../../lib/time';
import type { MatchDTO } from '../../../api/dto';
import { EVENT_LABEL, isDoublesRank } from '../roster/positionGrid/helpers';
import { MatchSideSection } from './MatchSideSection';

/** Side capacity derived from the event rank. Singles = 1, doubles = 2,
 *  unknown rank = 2 (let the operator fill it; validation flags oversize). */
function capacityForRank(rank: string | null | undefined): number {
  if (!rank?.trim()) return 2;
  return isDoublesRank(rank) ? 2 : 1;
}

export function MatchDetailPanel({
  match,
  status,
  onClose,
}: {
  match: MatchDTO;
  status?: MatchListStatus;
  onClose: () => void;
}) {
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const config = useTournamentStore((s) => s.config);
  const schedule = useTournamentStore((s) => s.schedule);
  const updateMatch = useTournamentStore((s) => s.updateMatch);
  const matchState = useMatchStateStore((s) => s.matchStates[match.id]);

  // G6 summary facts: the recorded score (per-set when the session has it,
  // the persisted aggregate otherwise) and the footer meta strip — court +
  // planned time, so the pane answers "where/when" without a trip to Plan.
  const laneSets =
    status === 'done'
      ? matchState?.sets?.length
        ? matchState.sets
        : matchState?.score
          ? [matchState.score]
          : null
      : null;
  const assignment = schedule?.assignments.find((a) => a.matchId === match.id);
  const meta = assignment
    ? `Court ${assignment.courtId}${config ? ` · ${slotToTime(assignment.slotId, config)}` : ''}`
    : null;
  const sideNames = (ids: string[] | undefined) => {
    const named = (ids ?? [])
      .map((id) => players.find((p) => p.id === id)?.name)
      .filter((n): n is string => !!n);
    return named.length === 0 ? (
      <span className="italic text-muted-foreground">No players</span>
    ) : (
      named.map((n, i) => (
        <span key={i} className="block">
          {formatPlayerName(n)}
        </span>
      ))
    );
  };

  const code = match.eventRank?.trim() ?? '';
  const prefix = code.match(/^[A-Z]+/)?.[0] ?? '';
  const capacity = capacityForRank(match.eventRank);

  const options = useMemo<EventPickerOption[]>(() => {
    // How many rostered players have entered each event — the context the
    // Draws list already proves is useful when choosing one.
    const entered = new Map<string, number>();
    for (const p of players) {
      for (const r of p.ranks ?? []) entered.set(r, (entered.get(r) ?? 0) + 1);
    }
    const out: EventPickerOption[] = [];
    for (const [key, count] of Object.entries(config?.rankCounts ?? {})) {
      for (let i = 1; i <= (count ?? 0); i++) {
        const value = `${key}${i}`;
        out.push({
          id: value,
          code: value,
          discipline: key,
          meta: `${entered.get(value) ?? 0} entered`,
        });
      }
    }
    // A rank the config no longer defines is still ON this match; offer it
    // so the operator's data does not silently disappear from the picker.
    if (code && !out.some((o) => o.id === code)) {
      out.push({ id: code, code, discipline: prefix || code, meta: 'legacy' });
    }
    return out;
  }, [players, config?.rankCounts, code, prefix]);

  // Read-only — Operations owns run-state; never interactive. A finished match
  // with a recorded score renders the G6 card (scores + winner say "done");
  // otherwise the pill. Built once and placed at the top or the bottom
  // depending on which it is — see the placement note below.
  const statusSection = status ? (
    <DetailPanel.Section eyebrow={laneSets ? 'Result' : 'Status'}>
      {laneSets ? (
        <MatchCard
          sideA={sideNames(match.sideA)}
          sideB={sideNames(match.sideB)}
          sets={laneSets}
          winner={setsWinner(laneSets)}
          meta={meta}
          data-testid="match-result-card"
        />
      ) : (
        <>
          <span data-testid="match-status-pill" className="inline-flex w-fit">
            <StatusPill tone={STATUS_PILL_TONE[status]} dot={status === 'live'}>
              {STATUS_LABEL[status]}
            </StatusPill>
          </span>
          {meta ? <p className="mt-1.5 text-2xs text-muted-foreground">{meta}</p> : null}
        </>
      )}
    </DetailPanel.Section>
  ) : null;

  return (
    <DetailPanel
      variant="docked"
      label="Match"
      value={code || '–'}
      sub={EVENT_LABEL[prefix]?.full}
      mono
      onClose={onClose}
      testId="match-detail-panel"
    >
      {/* An unfinished match leads with where and when it plays: that is the
          operational fact, and it used to sit at the very bottom under the
          sides, below a heading that said "Status" (MAT-5). A FINISHED match
          leads with its sides and closes with the result, which is the order
          you read it in. */}
      {status && !laneSets ? statusSection : null}

      <DetailPanel.Section eyebrow="Event">
        <Row pane
          label="Event"
          last
          control={
            <EventField
              value={code}
              options={options}
              onChange={(next) =>
                updateMatch(match.id, { eventRank: next ?? undefined })
              }
            />
          }
        />
      </DetailPanel.Section>

      <MatchSideSection
        label="Side A"
        ids={match.sideA ?? []}
        onChange={(ids) => updateMatch(match.id, { sideA: ids })}
        capacity={capacity}
        eventRank={match.eventRank}
        players={players}
        groups={groups}
      />
      <MatchSideSection
        label="Side B"
        ids={match.sideB ?? []}
        onChange={(ids) => updateMatch(match.id, { sideB: ids })}
        capacity={capacity}
        eventRank={match.eventRank}
        players={players}
        groups={groups}
      />

      {laneSets ? statusSection : null}
    </DetailPanel>
  );
}

/* =========================================================================
 * EventField — the trigger plus the shared EventPicker in a PickerPopover.
 * The picker never saves and never closes itself; both are done here.
 * ========================================================================= */
function EventField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: EventPickerOption[];
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <PickerPopover open={open} onOpenChange={setOpen}>
      <PickerPopover.Anchor asChild>
        <div ref={anchorRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Event"
            data-testid="match-event-trigger"
            className="h-7 min-w-[7rem] rounded-sm border border-border bg-bg-elev px-2 text-left text-sm font-semibold text-accent sw-num transition-colors duration-fast ease-brand hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {value || 'Choose event'}
          </button>
        </div>
      </PickerPopover.Anchor>
      <PickerPopover.Panel
        aria-label="Event"
        align="end"
        className="w-72"
        guardRef={anchorRef}
      >
        <EventPicker
          options={options}
          ariaLabel="Event"
          value={value || null}
          clearable
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PickerPopover.Panel>
    </PickerPopover>
  );
}
