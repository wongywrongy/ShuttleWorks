import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { WorkspaceModuleDTO } from '../../api/dto';
import type { WorkspaceModule } from '../product-shell/types';
import { modulesFromDto } from './moduleModel';

export interface WorkspaceModulesHook {
  /** Real persisted modules, or `null` when they are not known — which is
   *  either "still loading" or "the fetch failed". Read `error` to tell
   *  those apart; they call for opposite behaviour in the shell. */
  modules: WorkspaceModule[] | null;
  loading: boolean;
  /** The last fetch REJECTED. `modules` is null and its real contents are
   *  unknown — not empty, and not the kind-derived guess. */
  error: boolean;
  enable: (moduleId: string) => Promise<void>;
  disable: (moduleId: string) => Promise<void>;
  refetch: () => void;
}

/**
 * Fetches the workspace's persisted module catalog (`GET /tournaments/:id/modules`)
 * and exposes enable/disable mutations. Backend dependency-rule 409s surface as
 * toasts via the axios interceptor.
 *
 * A failure used to be indistinguishable from a load in progress — both left
 * `modules` null — so the shell answered both with the kind-derived catalog.
 * That guess is right for the load window and wrong for a failure: with this
 * endpoint 500ing, a bracket+display workspace rendered a Meet section it does
 * not have and hid the two it does (2026-08-10 full-scale browser pass).
 */
export function useWorkspaceModules(tid: string | null): WorkspaceModulesHook {
  const [dtos, setDtos] = useState<WorkspaceModuleDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Holds the cancel fn for the in-flight request so any new refetch — whether
  // from the mount effect or an imperative setStatus — supersedes the previous
  // one (last write wins on rapid enable/disable).
  const cancelRef = useRef<(() => void) | null>(null);

  const refetch = useCallback(() => {
    cancelRef.current?.();
    if (!tid) {
      setDtos(null);
      setError(false);
      cancelRef.current = null;
      return;
    }
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };
    setLoading(true);
    apiClient
      .getWorkspaceModules(tid)
      .then((rows) => {
        if (cancelled) return;
        setDtos(rows);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDtos(null);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [tid]);

  useEffect(() => {
    refetch();
    return () => cancelRef.current?.();
  }, [refetch]);

  const setStatus = useCallback(
    async (moduleId: string, status: string) => {
      if (!tid) return;
      await apiClient.patchWorkspaceModule(tid, moduleId, { status });
      refetch();
    },
    [tid, refetch],
  );

  const enable = useCallback((moduleId: string) => setStatus(moduleId, 'enabled'), [setStatus]);
  const disable = useCallback((moduleId: string) => setStatus(moduleId, 'disabled'), [setStatus]);

  const modules = dtos ? modulesFromDto(dtos) : null;
  return { modules, loading, error, enable, disable, refetch };
}
