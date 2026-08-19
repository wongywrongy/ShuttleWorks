import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';

/** Which board(s) a workspace has. `hybrid` = both operator modules enabled;
 *  the board renders one engine at a time and offers a switch (see
 *  `PublicDisplayPage`). */
export type DisplayKind = 'meet' | 'bracket' | 'hybrid';

/** Board kind from a workspace's ENABLED MODULES, falling back to the legacy
 *  `kind` column for payloads that carry no module rows.
 *
 *  `kind` is fixed at create time and names exactly one engine, so reading it
 *  alone made a hybrid workspace's second engine invisible on the board —
 *  while `derive_modules` proves hybrid is a supported, reachable state. */
function kindFromModules(t: TournamentSummaryDTO): DisplayKind {
  const modules = t?.modules ?? [];
  if (modules.length === 0) return t?.kind === 'bracket' ? 'bracket' : 'meet';
  const on = (id: string) => modules.some((m) => m.moduleId === id && m.status === 'enabled');
  if (on('meet') && on('bracket')) return 'hybrid';
  return on('bracket') ? 'bracket' : 'meet';
}

/** Resolve the board kind for the display.
 *
 *  Two modes:
 *  - ``?token=`` (the public capability link, SP-CLOUD-2): the unauthenticated
 *    ``/display/{token}/summary`` projection carries the kind (server-derived
 *    from the same module rows).
 *  - ``?id=`` (legacy) / the ``:id`` route param (the in-shell Preview tab at
 *    ``/tournaments/:id/tv``): the viewer-gated summary endpoint — the same
 *    context the display already runs in.
 *
 *  Returns null while loading; falls back to 'meet' on error so the display
 *  never blanks. */
export function useDisplayKind(): DisplayKind | null {
  const [searchParams] = useSearchParams();
  const params = useParams<{ id: string }>();
  const token = searchParams.get('token');
  // Same fallback `useDisplaySync` carries: the Preview tab has no query
  // string at all, so reading only `?id=` left the kind permanently null and
  // every bracket workspace stuck on the meet board's placeholder.
  const tid = searchParams.get('id') ?? params.id ?? null;
  const [kind, setKind] = useState<DisplayKind | null>(null);

  useEffect(() => {
    if (!token && !tid) return;
    let cancelled = false;
    const load = token
      ? apiClient.getDisplaySummary(token).then((s) => {
          if (!cancelled) {
            setKind(
              s.kind === 'bracket' || s.kind === 'hybrid' ? s.kind : 'meet',
            );
          }
        })
      : apiClient.getTournament(tid as string).then((t) => {
          if (!cancelled) setKind(kindFromModules(t));
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
