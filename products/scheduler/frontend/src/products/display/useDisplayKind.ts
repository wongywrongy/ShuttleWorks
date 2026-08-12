import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';

/** Resolve the workspace kind for the standalone display.
 *
 *  Two modes:
 *  - ``?token=`` (the public capability link, SP-CLOUD-2): the unauthenticated
 *    ``/display/{token}/summary`` projection carries the kind.
 *  - ``?id=`` (legacy) / the ``:id`` route param (the in-shell Preview tab at
 *    ``/tournaments/:id/tv``): the viewer-gated summary endpoint — the same
 *    context the display already runs in.
 *
 *  Returns null while loading; falls back to 'meet' on error so the display
 *  never blanks. */
export function useDisplayKind(): 'meet' | 'bracket' | null {
  const [searchParams] = useSearchParams();
  const params = useParams<{ id: string }>();
  const token = searchParams.get('token');
  // Same fallback `useDisplaySync` carries: the Preview tab has no query
  // string at all, so reading only `?id=` left the kind permanently null and
  // every bracket workspace stuck on the meet board's placeholder.
  const tid = searchParams.get('id') ?? params.id ?? null;
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
