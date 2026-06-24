import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';

/** Resolve the workspace kind for the standalone display from ``?id=``. The
 *  summary endpoint is `viewer`-gated — the same context the display already
 *  runs in. Returns null while loading; falls back to 'meet' on error so the
 *  display never blanks. */
export function useDisplayKind(): 'meet' | 'bracket' | null {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get('id');
  const [kind, setKind] = useState<'meet' | 'bracket' | null>(null);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    void apiClient
      .getTournament(tid)
      .then((t) => {
        if (!cancelled) setKind((t?.kind as 'meet' | 'bracket') ?? 'meet');
      })
      .catch(() => {
        if (!cancelled) setKind('meet');
      });
    return () => {
      cancelled = true;
    };
  }, [tid]);

  return kind;
}
