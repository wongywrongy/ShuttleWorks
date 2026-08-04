import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';

/** Resolve the workspace kind for the standalone display.
 *
 *  Two modes:
 *  - ``?token=`` (the public capability link, SP-CLOUD-2): the unauthenticated
 *    ``/display/{token}/summary`` projection carries the kind.
 *  - ``?id=`` (legacy / in-shell): the viewer-gated summary endpoint — the
 *    same context the display already runs in.
 *
 *  Returns null while loading; falls back to 'meet' on error so the display
 *  never blanks. */
export function useDisplayKind(): 'meet' | 'bracket' | null {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const tid = searchParams.get('id');
  const [kind, setKind] = useState<'meet' | 'bracket' | null>(null);

  useEffect(() => {
    if (!token && !tid) return;
    let cancelled = false;
    const load = token
      ? apiClient.getDisplaySummary(token).then((s) => {
          if (!cancelled) setKind(s.kind === 'bracket' ? 'bracket' : 'meet');
        })
      : apiClient.getTournament(tid as string).then((t) => {
          if (!cancelled) setKind((t?.kind as 'meet' | 'bracket') ?? 'meet');
        });
    void load.catch(() => {
      if (!cancelled) setKind('meet');
    });
    return () => {
      cancelled = true;
    };
  }, [token, tid]);

  return kind;
}
