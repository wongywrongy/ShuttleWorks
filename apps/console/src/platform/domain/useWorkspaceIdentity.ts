import { useTournamentStore } from '../../store/tournamentStore';
import { useUiStore } from '../../store/uiStore';
import type { WorkspaceIdentity } from '../product-shell/types';

/** Reads the open workspace's display identity from the tournament + ui
 *  stores. The name comes from the summary row cached by
 *  `useTournamentKind` (the config copy is the fallback); the date from the
 *  persisted config; status/kind from the same summary. */
export function useWorkspaceIdentity(): WorkspaceIdentity {
  // The workspace ROW's name wins. ``config.tournamentName`` is a
  // denormalised copy taken from the Setup ``general.name`` section, which a
  // CHECKED-OUT workspace can no longer amend (``CONFIG_LOCKED``, debt
  // OPR-0908-2) - so a renamed workspace kept rendering its old title in the
  // shell header while the Hub, the public tier and the venue board all
  // showed the new one. The copy stays as the fallback for the moment before
  // the summary row lands.
  const rowName = useUiStore((s) => s.activeTournamentName);
  const configName = useTournamentStore((s) => s.config?.tournamentName ?? null);
  const name = rowName ?? configName;
  const date = useTournamentStore((s) => s.config?.tournamentDate ?? null);
  const status = useUiStore((s) => s.activeTournamentStatus);
  const phase = useUiStore((s) => s.activeTournamentPhase);
  const kind = useUiStore((s) => s.activeTournamentKind);
  return { name, date, status, phase, kind };
}
