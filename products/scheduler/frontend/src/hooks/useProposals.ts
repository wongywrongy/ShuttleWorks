/**
 * Two-phase commit hook for the proposal pipeline.
 *
 * Wraps the proposal endpoints so dialogs (WarmRestartDialog,
 * DisruptionDialog, DragGantt drop, DirectorToolsPanel) can call a
 * single ``createProposal(...)`` and get back an active proposal that
 * the operator reviews — then ``commitProposal(id)`` swaps the
 * committed schedule atomically. Cancellation is symmetric.
 *
 * On commit success the hook updates ``schedule``, ``scheduleVersion``,
 * and ``scheduleHistory`` in the store, then clears ``activeProposal``.
 * The 409 (concurrency conflict) and 410 (expired) cases surface as
 * sticky toasts so the operator notices.
 */
import { useCallback, useState } from 'react';

import type {
  CommitProposalResponse,
  DirectorAction,
  DirectorActionRequest,
  ManualEditProposalRequest,
  RepairRequest,
  WarmRestartRequest,
} from '../api/client';
import { apiClient } from '../api/client';
import type { Disruption } from '../api/client';
import type { Proposal } from '../api/dto';
import { useTournamentStore } from '../store/tournamentStore';
import { useMatchStateStore } from '../store/matchStateStore';
import { useUiStore } from '../store/uiStore';
import { useTournamentId } from './useTournamentId';

type Status = 'idle' | 'loading' | 'error';

interface UseProposalsResult {
  status: Status;
  error: string | null;

  /** Create a warm-restart proposal (operator opens "Re-plan" dialog). */
  createWarmRestart: (stayCloseWeight?: number) => Promise<Proposal | null>;
  /** Create a repair proposal (operator submits a disruption). */
  createRepair: (disruption: Disruption) => Promise<Proposal | null>;
  /** Create a manual-edit proposal (operator drag-drops one match). */
  createManualEdit: (matchId: string, slotId: number, courtId: number) => Promise<Proposal | null>;
  /** Create a director-action proposal (delay_start/insert_blackout/remove_blackout). */
  createDirectorAction: (action: DirectorAction) => Promise<Proposal | null>;

  /** Commit the active (or specified) proposal. */
  commit: (id?: string) => Promise<CommitProposalResponse | null>;
  /** Cancel the active (or specified) proposal. */
  cancel: (id?: string) => Promise<void>;
}

export function useProposals(): UseProposalsResult {
  const tid = useTournamentId();
  const config = useTournamentStore((s) => s.config);
  const players = useTournamentStore((s) => s.players);
  const matches = useTournamentStore((s) => s.matches);
  const schedule = useTournamentStore((s) => s.schedule);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const setSchedule = useTournamentStore((s) => s.setSchedule);
  const setScheduleVersion = useTournamentStore((s) => s.setScheduleVersion);
  const setScheduleHistory = useTournamentStore((s) => s.setScheduleHistory);
  const setActiveProposal = useUiStore((s) => s.setActiveProposal);
  const setAdvisories = useUiStore((s) => s.setAdvisories);
  const setConfig = useTournamentStore((s) => s.setConfig);
  const setScheduleStale = useTournamentStore((s) => s.setScheduleStale);
  const pushToast = useUiStore((s) => s.pushToast);
  const activeProposal = useUiStore((s) => s.activeProposal);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback((): boolean => {
    if (!config || !schedule) {
      pushToast({
        level: 'error',
        message: 'No schedule to update',
        durationMs: 4000,
      });
      return false;
    }
    return true;
  }, [config, schedule, pushToast]);

  const handleError = useCallback(
    (err: unknown, fallback: string): null => {
      const msg = err instanceof Error ? err.message : fallback;
      setError(msg);
      setStatus('error');
      pushToast({ level: 'error', message: msg, durationMs: null });
      return null;
    },
    [pushToast],
  );

  const createWarmRestart = useCallback(
    async (stayCloseWeight = 10): Promise<Proposal | null> => {
      if (!guard()) return null;
      setStatus('loading');
      setError(null);
      try {
        const req: WarmRestartRequest = {
          originalSchedule: schedule!,
          config: config!,
          players,
          matches,
          matchStates,
          stayCloseWeight,
          nowIso: new Date().toISOString(),
        };
        const proposal = await apiClient.createWarmRestartProposal(tid, req);
        setActiveProposal(proposal);
        setStatus('idle');
        return proposal;
      } catch (err) {
        return handleError(err, 'Failed to create proposal');
      }
    },
    [guard, schedule, config, players, matches, matchStates, setActiveProposal, handleError],
  );

  const createRepair = useCallback(
    async (disruption: Disruption): Promise<Proposal | null> => {
      if (!guard()) return null;
      setStatus('loading');
      setError(null);
      try {
        const req: RepairRequest = {
          originalSchedule: schedule!,
          config: config!,
          players,
          matches,
          matchStates,
          disruption,
          nowIso: new Date().toISOString(),
        };
        const proposal = await apiClient.createRepairProposal(tid, req);
        setActiveProposal(proposal);
        setStatus('idle');
        return proposal;
      } catch (err) {
        return handleError(err, 'Failed to create repair proposal');
      }
    },
    [guard, schedule, config, players, matches, matchStates, setActiveProposal, handleError],
  );

  const createManualEdit = useCallback(
    async (matchId: string, slotId: number, courtId: number): Promise<Proposal | null> => {
      if (!guard()) return null;
      setStatus('loading');
      setError(null);
      try {
        const req: ManualEditProposalRequest = {
          originalSchedule: schedule!,
          config: config!,
          players,
          matches,
          matchStates,
          matchId,
          pinnedSlotId: slotId,
          pinnedCourtId: courtId,
        };
        const proposal = await apiClient.createManualEditProposal(tid, req);
        setActiveProposal(proposal);
        setStatus('idle');
        return proposal;
      } catch (err) {
        return handleError(err, 'Failed to create manual-edit proposal');
      }
    },
    [guard, schedule, config, players, matches, matchStates, setActiveProposal, handleError],
  );

  const createDirectorAction = useCallback(
    async (action: DirectorAction): Promise<Proposal | null> => {
      if (!guard()) return null;
      setStatus('loading');
      setError(null);
      try {
        const req: DirectorActionRequest = {
          action,
          config: config!,
          players,
          matches,
          originalSchedule: schedule!,
          matchStates,
        };
        const proposal = await apiClient.createDirectorActionProposal(tid, req);
        setActiveProposal(proposal);
        setStatus('idle');
        return proposal;
      } catch (err) {
        return handleError(err, 'Failed to create director-action proposal');
      }
    },
    [guard, schedule, config, players, matches, matchStates, setActiveProposal, handleError],
  );

  const commit = useCallback(
    async (id?: string): Promise<CommitProposalResponse | null> => {
      const target = id || activeProposal?.id;
      if (!target) return null;
      setStatus('loading');
      setError(null);
      try {
        const result = await apiClient.commitProposal(tid, target);
        setSchedule(result.state.schedule ?? null);
        setScheduleVersion(result.state.scheduleVersion ?? 0);
        setScheduleHistory(result.state.scheduleHistory ?? []);
        if (result.state.config) setConfig(result.state.config);
        // setConfig flags the schedule as stale whenever scheduling-
        // relevant fields change (e.g., closedCourts after a
        // court_closed disruption). The schedule we just committed
        // already accounts for those changes, so override that flag
        // back to false here.
        setScheduleStale(false);
        setActiveProposal(null);
        // The committed schedule may have resolved the conditions that
        // triggered the now-stale advisories (a repaired overrun no
        // longer overruns, etc.). Drop them so the next poll repopulates
        // from a clean slate.
        setAdvisories([]);
        pushToast({
          level: 'success',
          message: result.historyEntry.summary || 'Proposal committed',
          durationMs: 4000,
        });
        setStatus('idle');
        return result;
      } catch (err) {
        // 409 (version conflict) and 410 (expired) are expected and
        // surface as sticky errors — the operator must re-create the
        // proposal in either case.
        return handleError(err, 'Commit failed');
      }
    },
    [
      activeProposal,
      setSchedule,
      setScheduleVersion,
      setScheduleHistory,
      setConfig,
      setScheduleStale,
      setActiveProposal,
      setAdvisories,
      pushToast,
      handleError,
    ],
  );

  const cancel = useCallback(
    async (id?: string): Promise<void> => {
      const target = id || activeProposal?.id;
      if (!target) return;
      try {
        await apiClient.cancelProposal(tid, target);
      } catch {
        // Swallow — cancel is best-effort. Even if the server doesn't
        // know about it (already expired), we still want to clear the
        // local active proposal so the dialog closes cleanly.
      } finally {
        setActiveProposal(null);
        setStatus('idle');
      }
    },
    [activeProposal, setActiveProposal],
  );

  return {
    status,
    error,
    createWarmRestart,
    createRepair,
    createManualEdit,
    createDirectorAction,
    commit,
    cancel,
  };
}
