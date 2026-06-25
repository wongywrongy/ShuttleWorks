/** Post-create navigation for the `/new` route: maps the backend-returned
 *  workspace to the route it should open on. */
import type { TournamentSummaryDTO } from '../../api/dto';
import { modulesFromDto, modulesForWorkspace } from '../../platform/domain/moduleModel';

type CreatedLike = Pick<TournamentSummaryDTO, 'id' | 'kind' | 'modules'>;

/** Where to land after creating a workspace. Opens on the in-workspace Overview
 *  (the readiness landing — same as the Hub's "Open"), so the entry point is
 *  consistent however you arrive. A workspace with no enabled module (Blank / a
 *  fully-available Custom build) opens on the Modules admin instead, so the
 *  operator can enable one before there's anything to be ready for.
 *
 *  Precondition: the blank/available-only guarantee holds only when `created.modules`
 *  is present. If it's absent (legacy pre-modules payload), we fall back to
 *  kind-derived modules — which always has one enabled module — so it lands on Overview. */
export function landingRoute(created: CreatedLike): string {
  const mods = created.modules ? modulesFromDto(created.modules) : modulesForWorkspace(created.kind);
  const anyEnabled = mods.some((m) => m.status === 'enabled');
  if (!anyEnabled) return `/tournaments/${created.id}/ws-modules`;
  return `/tournaments/${created.id}/overview`;
}
