import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../api/client';
import type { BoardSettingsDTO, TournamentSummaryDTO } from '../../api/dto';

/** Which board(s) a workspace has. `hybrid` = both operator modules enabled;
 *  the board renders one engine at a time and offers a switch (see
 *  `PublicDisplayPage`). */
export type DisplayKind = 'meet' | 'bracket' | 'hybrid';

/** The board's own defaults, used until the first read lands and whenever a
 *  workspace has never opened the appearance controls. `showNext: false` is
 *  the contract default (match-card §4.4), not a loading placeholder. */
export const DEFAULT_BOARD_SETTINGS: BoardSettingsDTO = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

/**
 * Everything about the board that is NOT match data: which engine(s) it
 * renders, the tournament's own timezone, and the persisted board settings
 * (branding + Show next / Show scores).
 *
 * `timeZone` is null when the workspace has no usable zone — the board then
 * OMITS its clock rather than falling back to UTC, which is what both boards
 * used to hardcode (match-card contract §4.4: "timezone is data, not a
 * constant"). It is also null while the first read is in flight, so the
 * clock appears with the rest of the board rather than jumping zones.
 */
export interface BoardContext {
  kind: DisplayKind | null;
  /** The workspace's own name — the board's title when the operator has not
   *  set one. The bracket projection carries no name of its own. */
  name: string | null;
  timeZone: string | null;
  board: BoardSettingsDTO;
}

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

/**
 * Resolve the board's context.
 *
 *  Two modes:
 *  - ``?token=`` (the public capability link, SP-CLOUD-2): the unauthenticated
 *    ``/display/{token}/summary`` projection carries kind, timezone AND the
 *    board settings in one read — the board is anonymous, so it cannot reach
 *    the authenticated routes for either.
 *  - ``?id=`` (legacy) / the ``:id`` route param (the in-shell Preview tab at
 *    ``/tournaments/:id/tv``): the viewer-gated workspace summary plus the
 *    viewer-gated board-settings route — two reads, same answers.
 *
 *  `kind` is null while loading and falls back to 'meet' on error so the
 *  board never blanks. A failed board-settings read leaves the defaults;
 *  branding is decoration, and losing it must not take the board down.
 */
export function useBoardContext(): BoardContext {
  const [searchParams] = useSearchParams();
  const params = useParams<{ id: string }>();
  const token = searchParams.get('token');
  // Same fallback `useDisplaySync` carries: the Preview tab has no query
  // string at all, so reading only `?id=` left the kind permanently null and
  // every bracket workspace stuck on the meet board's placeholder.
  const tid = searchParams.get('id') ?? params.id ?? null;
  const [kind, setKind] = useState<DisplayKind | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardSettingsDTO>(DEFAULT_BOARD_SETTINGS);

  useEffect(() => {
    if (!token && !tid) return;
    let cancelled = false;
    const load = token
      ? apiClient.getDisplaySummary(token).then((s) => {
          if (cancelled) return;
          setKind(s.kind === 'bracket' || s.kind === 'hybrid' ? s.kind : 'meet');
          setName(s.name ?? null);
          setTimeZone(s.timeZone ?? null);
          setBoard({ ...DEFAULT_BOARD_SETTINGS, ...(s.board ?? {}) });
        })
      : apiClient.getTournament(tid as string).then((t) => {
          if (cancelled) return;
          setKind(kindFromModules(t));
          setName(t.name ?? null);
          setTimeZone(t.timeZone ?? null);
          // Separate read, separate failure: the board still renders with
          // its default appearance if this one is refused.
          void apiClient
            .getBoardSettings(tid as string)
            .then((b) => {
              if (!cancelled) setBoard({ ...DEFAULT_BOARD_SETTINGS, ...b });
            })
            .catch(() => {});
        });
    void load.catch(() => {
      if (!cancelled) setKind('meet');
    });
    return () => {
      cancelled = true;
    };
  }, [token, tid]);

  return { kind, name, timeZone, board };
}

/** Kind only — the board-kind router's original question. */
export function useDisplayKind(): DisplayKind | null {
  return useBoardContext().kind;
}
