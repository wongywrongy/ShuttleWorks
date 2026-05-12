/**
 * Right-column sidebar for the SchedulePage shell. Owns the Log /
 * Details / Candidates tab swap, the Director / Re-plan / Disruption
 * action row, and the dialog hosts that those actions open.
 *
 * Lifted out of SchedulePage to keep that file under the Phase 5 line
 * target. State that's truly local here (which tab is active, which
 * dialog is open) stays here; state SchedulePage needs in its own
 * branches (e.g. `selectedMatchId`, the visualization layout) is
 * passed through as props.
 */
import { useEffect, useState } from 'react';
import { GearSix } from '@phosphor-icons/react';
import type {
  ScheduleAssignment,
  MatchDTO,
  PlayerDTO,
  RosterGroupDTO,
  TournamentConfig,
} from '../../api/dto';
import { SolverProgressLog } from '../../features/schedule/live/SolverProgressLog';
import { CandidatesPanel } from '../../features/schedule/CandidatesPanel';
import { MatchDetailsPanel } from '../../features/control-center/MatchDetailsPanel';
import { DisruptionDialog } from '../../features/control-center/DisruptionDialog';
import { MoveMatchDialog } from '../../features/control-center/MoveMatchDialog';
import { WarmRestartDialog } from '../../features/schedule/WarmRestartDialog';
import { DirectorToolsPanel } from '../../features/director/DirectorToolsPanel';
import { Modal } from '../../components/common/Modal';
import { useAppStore } from '../../store/appStore';
import { useProposals } from '../../hooks/useProposals';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { TrafficLightResult } from '../../hooks/useTrafficLights';

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
}) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTabKey>('details');
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [warmRestartOpen, setWarmRestartOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [moveMatchId, setMoveMatchId] = useState<string | null>(null);
  const [disruptionPrefill, setDisruptionPrefill] = useState<{
    type?: 'withdrawal' | 'court_closed' | 'overrun' | 'cancellation';
    matchId?: string;
    courtId?: number;
  }>({});
  const { cancel: cancelProposal } = useProposals();

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
    <>
      <div className="w-80 flex-shrink-0 flex flex-col border-l border-border/60">
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
          {!isOptimizing && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/40 px-2 py-1.5">
              <span className="eyebrow flex-shrink-0" aria-hidden="true">
                Dynamic
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDirectorOpen(true)}
                  title="Director tools — delays, breaks, reopen courts"
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`}
                >
                  <GearSix aria-hidden="true" className="h-4 w-4" />
                  Director
                </button>
                <button
                  type="button"
                  onClick={() => setWarmRestartOpen(true)}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`}
                  title="Re-plan from here (full re-solve, stay-close objective)"
                >
                  Re-plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDisruptionPrefill({});
                    setDisruptionOpen(true);
                  }}
                  className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`}
                  title="Repair after a disruption"
                >
                  Disruption
                </button>
              </div>
            </div>
          )}
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
              onSelect={(i) => useAppStore.getState().setActiveCandidateIndex(i)}
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
                setDisruptionPrefill({
                  type,
                  matchId: type === 'court_closed' ? undefined : matchId,
                  courtId,
                });
                setDisruptionOpen(true);
              }}
              onRequestMove={(matchId) => setMoveMatchId(matchId)}
            />
          )}
        </div>
      </div>

      <DisruptionDialog
        isOpen={disruptionOpen}
        onClose={() => setDisruptionOpen(false)}
        initialType={disruptionPrefill.type}
        initialMatchId={disruptionPrefill.matchId}
        initialCourtId={disruptionPrefill.courtId}
      />
      <WarmRestartDialog
        isOpen={warmRestartOpen}
        onClose={() => setWarmRestartOpen(false)}
      />
      <MoveMatchDialog
        isOpen={moveMatchId !== null}
        onClose={() => setMoveMatchId(null)}
        matchId={moveMatchId ?? undefined}
      />
      {directorOpen && (
        <Modal
          onClose={() => {
            void cancelProposal();
            setDirectorOpen(false);
          }}
          titleId="director-tools-title"
          widthClass="max-w-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 id="director-tools-title" className="text-sm font-semibold">
              Director tools
            </h2>
            <button
              type="button"
              onClick={() => {
                void cancelProposal();
                setDirectorOpen(false);
              }}
              className={`${INTERACTIVE_BASE} rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground`}
              aria-label="Close director tools"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto max-h-[calc(80vh-3rem)]">
            <DirectorToolsPanel />
          </div>
        </Modal>
      )}
    </>
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
        'whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
