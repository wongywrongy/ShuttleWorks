/**
 * MeetMatchPanel — the meet-engine rail below the RunInspector
 * (SP-CONSOLE-4 C4). Mounted by RunSurface for a selected non-done meet
 * match, exactly as the bracket MatchDetailPanel is mounted for a playing
 * bracket match: it adds only what the generic inspector cannot carry.
 *
 *   - Score entry (called/started): the shared ScoreEditor (quick two-number
 *     or per-set badminton, format-aware) → `updateMatchStatus('finished')`
 *     on the versioned per-match state route, then the caller's record
 *     completion (auto-pull + deselect) via `onFinished`.
 *   - Undo start (started): restores the stored original slot/court and
 *     walks the state back to `scheduled`, clearing the start stamp.
 *   - Players: check-in pills while called (+ "All in"), substitute picker
 *     and the armed remove on every row until the match finishes.
 *   - Impacted: matches sharing a player with this one, click-to-select.
 */
import { useMemo, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { DetailPanel } from '../../../components/control-plane';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useConfirmClick } from '../../../hooks/useConfirmClick';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import { getMatchLabel } from '../../../lib/matchUtils';
import type { RunMatch } from '../runtime/runModel';
import type { MeetRunOps } from './useMeetRunOps';
import { ScoreEditor } from './ScoreEditor';

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground ` +
  `disabled:cursor-not-allowed disabled:opacity-50`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-accent px-2 py-1 ` +
  `text-2xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand ` +
  `hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50`;

export interface MeetMatchPanelProps {
  match: RunMatch;
  ops: MeetRunOps;
  /** Record completion (auto-pull + deselect) — runs after a score saves. */
  onFinished: () => void;
  /** Select another match on the surface (Impacted rows). */
  onSelectKey?: (key: string) => void;
}

export function MeetMatchPanel({ match, ops, onFinished, onSelectKey }: MeetMatchPanelProps) {
  const canEdit = useCanEdit();
  const [scoring, setScoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = busy || !canEdit;

  const dto = useMemo(() => ops.matches.find((m) => m.id === match.id), [ops.matches, match.id]);
  const matchState = ops.matchStates[match.id];
  const status = matchState?.status ?? 'scheduled';
  const playerNames = useMemo(
    () => new Map(ops.players.map((p) => [p.id, p.name])),
    [ops.players],
  );
  const analysis = useMemo(() => ops.analyzeImpact(match.id), [ops, match.id]);

  if (!dto) return null;

  const allPlayerIds = [...(dto.sideA ?? []), ...(dto.sideB ?? [])];
  const confirmations = matchState?.playerConfirmations ?? {};
  const missingPlayers = allPlayerIds.filter((id) => !confirmations[id]);
  const showCheckIn = status === 'called';
  const canEditRoster = status !== 'finished';
  const inMatchIds = new Set(allPlayerIds);
  const subCandidates = ops.players.filter(
    (p) => !inMatchIds.has(p.id) && p.status !== 'withdrawn',
  );

  const handleUndoStart = async () => {
    setBusy(true);
    try {
      ops.undoStart(match.id);
      // Back to `scheduled`, not `called`: the server has no playing→called
      // edge (audit A1). The match drops back into the queue.
      await ops.updateMatchStatus(match.id, 'scheduled', { actualStartTime: undefined });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (playerId: string) => {
    setBusy(true);
    try {
      await ops.confirmPlayer(match.id, playerId, !confirmations[playerId]);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckInAll = async () => {
    setBusy(true);
    try {
      await Promise.all(missingPlayers.map((id) => ops.confirmPlayer(match.id, id, true)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="meet-match-panel">
      {(status === 'called' || status === 'started') && (
        <DetailPanel.Section eyebrow="Score" testId="meet-run-score">
          {scoring ? (
            <ScoreEditor
              match={dto}
              matchState={matchState}
              config={ops.config}
              playerNames={playerNames}
              onSubmit={async ({ score, sets, notes }) => {
                setBusy(true);
                try {
                  await ops.updateMatchStatus(match.id, 'finished', { score, sets, notes });
                  setScoring(false);
                  onFinished();
                } finally {
                  setBusy(false);
                }
              }}
              onCancel={() => setScoring(false)}
              isSubmitting={busy}
            />
          ) : (
            <button
              type="button"
              data-testid="meet-run-enter-score"
              className={primaryBtn}
              disabled={locked}
              onClick={() => setScoring(true)}
              title="Record the final score (quick total or per-set)"
            >
              Enter score…
            </button>
          )}
        </DetailPanel.Section>
      )}

      {status === 'started' && (
        <DetailPanel.Section eyebrow="Undo" testId="meet-run-undo">
          <button
            type="button"
            data-testid="meet-run-undo-start"
            className={actionBtn}
            disabled={locked}
            onClick={() => void handleUndoStart()}
          >
            Undo start
          </button>
          <p className="mt-2 text-2xs text-muted-foreground">
            Returns the match to the queue and restores its planned slot. Nothing is lost.
          </p>
        </DetailPanel.Section>
      )}

      {canEditRoster && (
        <DetailPanel.Section eyebrow="Players" testId="meet-run-players">
          {showCheckIn && missingPlayers.length > 0 && (
            <button
              type="button"
              data-testid="meet-run-checkin-all"
              className={`${primaryBtn} mb-2`}
              disabled={locked}
              onClick={() => void handleCheckInAll()}
              title={`Check in all ${missingPlayers.length} remaining`}
            >
              <Check aria-hidden="true" className="mr-1 h-3 w-3" />
              All in
            </button>
          )}
          <div className="space-y-1">
            {allPlayerIds.map((playerId) => (
              <PlayerRow
                key={playerId}
                playerId={playerId}
                name={playerNames.get(playerId) ?? playerId}
                confirmed={!!confirmations[playerId]}
                showCheckIn={showCheckIn}
                locked={locked}
                subCandidates={subCandidates}
                onConfirm={() => void handleConfirm(playerId)}
                onSubstitute={(newId) => ops.substitutePlayer(match.id, playerId, newId)}
                onRemove={() => ops.removePlayer(match.id, playerId)}
              />
            ))}
          </div>
        </DetailPanel.Section>
      )}

      {analysis && analysis.directlyImpacted.length > 0 && (
        <DetailPanel.Section
          eyebrow={`Impacted (${analysis.directlyImpacted.length})`}
          testId="meet-run-impact"
        >
          <div className="divide-y divide-border/60 rounded bg-muted/40">
            {analysis.directlyImpacted.map((impactedId) => {
              const impacted = ops.matches.find((m) => m.id === impactedId);
              const shared = [...(impacted?.sideA ?? []), ...(impacted?.sideB ?? [])]
                .filter((id) => inMatchIds.has(id))
                .map((id) => playerNames.get(id) ?? id);
              return (
                <button
                  key={impactedId}
                  type="button"
                  onClick={() => onSelectKey?.(`meet:${impactedId}`)}
                  className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-12 flex-shrink-0 text-2xs font-medium tabular-nums text-foreground">
                    {impacted?.eventRank || getMatchLabel(impacted, impactedId)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-3xs text-muted-foreground">
                    {shared.join(', ') || '–'}
                  </span>
                </button>
              );
            })}
          </div>
        </DetailPanel.Section>
      )}
    </div>
  );
}

function PlayerRow({
  playerId,
  name,
  confirmed,
  showCheckIn,
  locked,
  subCandidates,
  onConfirm,
  onSubstitute,
  onRemove,
}: {
  playerId: string;
  name: string;
  confirmed: boolean;
  showCheckIn: boolean;
  locked: boolean;
  subCandidates: { id: string; name: string }[];
  onConfirm: () => void;
  onSubstitute: (newPlayerId: string) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  // Removing a player from the match fires no dialog — the canon two-click
  // arm guards it (window.confirm is banned).
  const confirmRemove = useConfirmClick(onRemove);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="min-w-0 break-words text-foreground">{name}</span>
        <span className="inline-flex items-center gap-1">
          {showCheckIn && (
            <button
              type="button"
              data-testid={`meet-run-checkin-${playerId}`}
              onClick={onConfirm}
              disabled={locked}
              aria-pressed={confirmed}
              title={confirmed ? `Mark ${name} as not checked in` : `Check in ${name}`}
              aria-label={confirmed ? `Mark ${name} as not checked in` : `Check in ${name}`}
              className={`inline-flex h-4 w-4 items-center justify-center rounded text-3xs ${
                confirmed
                  ? 'bg-status-live text-bg-elev'
                  : 'border border-border bg-card text-muted-foreground hover:bg-muted/40'
              }`}
            >
              {confirmed ? <Check aria-hidden="true" className="h-2.5 w-2.5" /> : null}
            </button>
          )}
          <button
            type="button"
            data-testid={`meet-run-sub-${playerId}`}
            onClick={() => setPicking((v) => !v)}
            disabled={locked}
            aria-expanded={picking}
            aria-label={`Substitute ${name}`}
            className={`rounded border border-border bg-card px-1 text-3xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              picking
                ? 'bg-muted/40 text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            Sub
          </button>
          <button
            type="button"
            data-testid={`meet-run-remove-${playerId}`}
            onClick={confirmRemove.press}
            onBlur={confirmRemove.reset}
            disabled={locked}
            aria-label={confirmRemove.armed ? `Confirm remove ${name}` : `Remove ${name}`}
            title={
              confirmRemove.armed
                ? `Click again to remove ${name} from the match`
                : `Remove ${name} from this match`
            }
            className={`disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmRemove.armed
                ? 'rounded border border-destructive bg-destructive px-1 text-3xs font-semibold text-destructive-foreground sw-pulse'
                : 'rounded border border-destructive/40 bg-status-blocked-bg px-1 text-3xs text-status-blocked hover:bg-status-blocked-bg/70'
            }`}
          >
            {confirmRemove.armed ? '× confirm' : '×'}
          </button>
        </span>
      </div>
      {picking && (
        <div className="ml-3 rounded border border-border bg-card text-2xs">
          <div className="border-b border-border/60 px-1.5 py-1 text-3xs leading-snug text-muted-foreground">
            Replaces this player in this match only.
          </div>
          <div className="max-h-32 overflow-y-auto">
            {subCandidates.length === 0 && (
              <div className="px-1.5 py-1 text-3xs text-muted-foreground">No available players.</div>
            )}
            {subCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSubstitute(p.id);
                  setPicking(false);
                }}
                className="block w-full break-words px-1.5 py-0.5 text-left text-foreground hover:bg-muted/40"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
