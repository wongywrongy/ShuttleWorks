import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import type { WorkspaceModuleDTO } from '../../api/dto';
import type { WorkspaceModule } from '../product-shell/types';
import { modulesFromDto } from './moduleModel';

export interface WorkspaceModulesHook {
  /** Real persisted modules, or `null` while loading / on error (caller
   *  falls back to the kind-derived catalog). */
  modules: WorkspaceModule[] | null;
  loading: boolean;
  enable: (moduleId: string) => Promise<void>;
  disable: (moduleId: string) => Promise<void>;
  refetch: () => void;
}

/**
 * Fetches the workspace's persisted module catalog (`GET /tournaments/:id/modules`)
 * and exposes enable/disable mutations. Backend dependency-rule 409s surface as
 * toasts via the axios interceptor; on failure `modules` stays null so the shell
 * falls back to the kind-derived catalog.
 */
export function useWorkspaceModules(tid: string | null): WorkspaceModulesHook {
  const [dtos, setDtos] = useState<WorkspaceModuleDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Holds the cancel fn for the in-flight request so any new refetch — whether
  // from the mount effect or an imperative setStatus — supersedes the previous
  // one (last write wins on rapid enable/disable).
  const cancelRef = useRef<(() => void) | null>(null);

  const refetch = useCallback(() => {
    cancelRef.current?.();
    if (!tid) {
      setDtos(null);
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
        if (!cancelled) setDtos(rows);
      })
      .catch(() => {
        if (!cancelled) setDtos(null);
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
  return { modules, loading, enable, disable, refetch };
}
