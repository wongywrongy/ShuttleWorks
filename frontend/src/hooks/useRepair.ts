/**
 * Repair / warm-restart hook.
 *
 * Wraps the ``/schedule/repair`` and ``/schedule/warm-restart``
 * endpoints with loading state + toast feedback. The caller pulls
 * tournament inputs from the store and supplies a disruption payload;
 * the hook returns ``{repair, warmRestart, status}`` so a dialog can
 * disable buttons during in-flight requests.
 *
 * On success, the new schedule is written into the store via
 * ``setSchedule``; persistence to the server-side tournament file
 * happens automatically through the existing
 * ``useTournamentState`` debounced PUT.
 */
import { useCallback, useState } from 'react';

import type { Disruption, RepairResponse, WarmRestartResponse } from '../api/client';
import { apiClient } from '../api/client';
import { useAppStore } from '../store/appStore';

type Status = 'idle' | 'loading' | 'error';

interface RepairResult {
  status: Status;
  error: string | null;
  repair: (disruption: Disruption) => Promise<RepairResponse | null>;
  warmRestart: (stayCloseWeight?: number) => Promise<WarmRestartResponse | null>;
}

export function useRepair(): RepairResult {
  const config = useAppStore((s) => s.config);
  const players = useAppStore((s) => s.players);
  const matches = useAppStore((s) => s.matches);
  const schedule = useAppStore((s) => s.schedule);
  const matchStates = useAppStore((s) => s.matchStates);
  const setSchedule = useAppStore((s) => s.setSchedule);
  const pushToast = useAppStore((s) => s.pushToast);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const repair = useCallback(
    async (disruption: Disruption) => {
      if (!config || !schedule) {
        pushToast({ level: 'error', message: 'No schedule to repair', durationMs: 4000 });
        return null;
      }
      setStatus('loading');
      setError(null);
      try {
        const result = await apiClient.repairSchedule({
          originalSchedule: schedule,
          config,
          players,
          matches,
          matchStates,
          disruption,
          nowIso: new Date().toISOString(),
        });
        setSchedule(result.schedule);
        pushToast({
          level: 'success',
          message: `Repair complete — ${result.repairedMatchIds.length} match${result.repairedMatchIds.length === 1 ? '' : 'es'} affected`,
          durationMs: 4000,
        });
        setStatus('idle');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Repair failed';
        setError(msg);
        setStatus('error');
        pushToast({ level: 'error', message: msg, durationMs: 5000 });
        return null;
      }
    },
    [config, schedule, players, matches, matchStates, setSchedule, pushToast],
  );

  const warmRestart = useCallback(
    async (stayCloseWeight: number = 10) => {
      if (!config || !schedule) {
        pushToast({ level: 'error', message: 'No schedule to re-plan', durationMs: 4000 });
        return null;
      }
      setStatus('loading');
      setError(null);
      try {
        const result = await apiClient.warmRestartSchedule({
          originalSchedule: schedule,
          config,
          players,
          matches,
          matchStates,
          stayCloseWeight,
          nowIso: new Date().toISOString(),
        });
        setSchedule(result.schedule);
        pushToast({
          level: 'success',
          message: `Re-plan complete — ${result.movedMatchIds.length} match${result.movedMatchIds.length === 1 ? '' : 'es'} moved`,
          durationMs: 4000,
        });
        setStatus('idle');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Re-plan failed';
        setError(msg);
        setStatus('error');
        pushToast({ level: 'error', message: msg, durationMs: 5000 });
        return null;
      }
    },
    [config, schedule, players, matches, matchStates, setSchedule, pushToast],
  );

  return { status, error, repair, warmRestart };
}
