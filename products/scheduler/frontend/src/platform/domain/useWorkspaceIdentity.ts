import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import type { WorkspaceIdentity } from '../product-shell/types';

/** Reads the open workspace's display identity from the tournament + ui
 *  stores. Name/date come from the persisted config; status/kind from the
 *  summary cached by `useTournamentKind`. */
export function useWorkspaceIdentity(): WorkspaceIdentity {
  const name = useTournamentStore((s) => s.config?.tournamentName ?? null);
  const date = useTournamentStore((s) => s.config?.tournamentDate ?? null);
  const status = useUiStore((s) => s.activeTournamentStatus);
  const kind = useUiStore((s) => s.activeTournamentKind);
  return { name, date, status, kind };
}
