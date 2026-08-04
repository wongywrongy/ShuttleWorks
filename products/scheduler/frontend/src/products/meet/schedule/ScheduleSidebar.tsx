/**
 * Right-column sidebar for the SchedulePage shell — the stacked rail
 * model (SPEC_AMENDMENT_alerts_activity_panel §4, Phase 4.1):
 *
 *   1. Alerts & Activity on top — always visible, collapsible to a
 *      count chip, never hidden by tab/selection state.
 *   2. The Log / Details / Candidates tab zone below (the tabs ARE the
 *      "details" zone on this surface).
 *
 * Dialog hosts and the Director / Re-plan / Disruption actions moved to
 * SchedulePage's toolbar (Phase 4.3 — same home as Run); this component
 * only raises intents via the onRequest* props.
 */
import { useEffect, useState } from 'react';
import type {
  Advisory,
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../../api/dto';
import { SolverProgressLog } from '../schedule/live/SolverProgressLog';
import { CandidatesPanel } from '../schedule/CandidatesPanel';
import { MatchDetailsPanel } from '../control-center/MatchDetailsPanel';
import { AlertsActivityPanel } from '../control-center/AlertsActivityPanel';
import { useTournamentStore } from '../../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import type { TrafficLightResult } from '../../../hooks/useTrafficLights';

type SidebarTabKey = 'log' | 'details' | 'candidates';

export function ScheduleSidebar({
  isOptimizing,
  schedule,
  matches,
  matchStates,
  players,
  groups,
  config,
  currentSlot,
  selectedMatchId,
  setSelectedMatchId,
  selectedAssignment,
  selectedMatch,
  selectedMatchState,
  selectedTrafficLight,
  playerNames,
  slotToTime,
  displayAssignments,
  solutionCount,
  objectiveScore,
  status,
  violations,
  onAdvisoryReview,
  onRequestDisruption,
  onRequestMove,
}: {
  isOptimizing: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule: any;
  matches: MatchDTO[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchStates: any;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  config: TournamentConfig;
  currentSlot: number | null;
  selectedMatchId: string | null;
  setSelectedMatchId: (id: string | null) => void;
  selectedAssignment: ScheduleAssignment | undefined;
  selectedMatch: MatchDTO | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedMatchState: any;
  selectedTrafficLight: TrafficLightResult | undefined;
  playerNames: Map<string, string>;
  slotToTime: (slot: number) => string;
  displayAssignments: ScheduleAssignment[];
  solutionCount: number | undefined;
  objectiveScore: number | undefined;
  status: 'solving' | 'complete';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  violations: any[];
  onAdvisoryReview: (advisory: Advisory) => void;
  onRequestDisruption: (prefill: {
    type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';
    matchId?: string;
    courtId?: number;
  }) => void;
  onRequestMove: (matchId: string) => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTabKey>('details');

  // Auto-flip tabs as solver state changes — see SchedulePage's prior
  // logic. Solving → Log; idle → Details; selecting a match while idle
  // snaps to Details.
  useEffect(() => {
    if (isOptimizing) {
      setSidebarTab('log');
    } else {
      setSidebarTab('details');
    }
  }, [isOptimizing]);
  useEffect(() => {
    if (selectedMatchId && !isOptimizing) setSidebarTab('details');
  }, [selectedMatchId, isOptimizing]);

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-l border-border/60">
      {/* Alerts never hidden by the tab zone; capped so a long trail can't
          squeeze it out (same bound rationale as the Run rail). */}
      <AlertsActivityPanel onReview={onAdvisoryReview} className="max-h-[40%]" />
      <div className="border-b border-border/60 flex-shrink-0">
        <div
          role="tablist"
          aria-label="Sidebar views"
          className="flex flex-wrap items-center gap-1 px-2 py-1.5"
        >
          {isOptimizing ? (
            <>
              <SidebarTab active={sidebarTab === 'log'} onClick={() => setSidebarTab('log')}>
                Log
              </SidebarTab>
              <SidebarTab active={sidebarTab === 'details'} onClick={() => setSidebarTab('details')}>
                Details
              </SidebarTab>
            </>
          ) : (
            <>
              <SidebarTab active={sidebarTab === 'details'} onClick={() => setSidebarTab('details')}>
                Details
              </SidebarTab>
              {(schedule?.candidates?.length ?? 0) > 0 && (
                <SidebarTab
                  active={sidebarTab === 'candidates'}
                  onClick={() => setSidebarTab('candidates')}
                >
                  Candidates
                </SidebarTab>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isOptimizing && sidebarTab === 'log' ? (
          <div className="p-2">
            <SolverProgressLog
              solutionCount={solutionCount}
              objectiveScore={objectiveScore}
              matchCount={displayAssignments.length}
              totalMatches={matches.length}
              status={status}
              violations={violations}
            />
          </div>
        ) : sidebarTab === 'candidates' ? (
          <CandidatesPanel
            schedule={schedule}
            onSelect={(i) => useTournamentStore.getState().setActiveCandidateIndex(i)}
          />
        ) : (
          <MatchDetailsPanel
            assignment={selectedAssignment}
            match={selectedMatch}
            matchState={selectedMatchState}
            matches={matches}
            trafficLight={selectedTrafficLight}
            playerNames={playerNames}
            slotToTime={slotToTime}
            onSelectMatch={setSelectedMatchId}
            schedule={schedule}
            matchStates={matchStates}
            players={players}
            groups={groups}
            config={config}
            currentSlot={currentSlot ?? undefined}
            onRequestDisruption={(type, matchId) => {
              const courtId =
                type === 'court_closed' && selectedAssignment
                  ? selectedAssignment.courtId
                  : undefined;
              onRequestDisruption({
                type,
                matchId: type === 'court_closed' ? undefined : matchId,
                courtId,
              });
            }}
            onRequestMove={onRequestMove}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Sidebar tab — visually distinct from action buttons (filled when
 * active, muted when not). Lives on its own row above action buttons.
 */
function SidebarTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        INTERACTIVE_BASE,
        'whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium',
        active
          ? 'bg-accent text-accent-ink shadow-glow hover:brightness-110'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
