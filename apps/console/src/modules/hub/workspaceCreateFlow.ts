/** Post-create navigation for the `/new` route: maps the backend-returned
 *  workspace to the route it should open on. */
import type { TournamentSummaryDTO } from '../../api/dto';
import { modulesFromDto, modulesForWorkspace } from '../../platform/domain/moduleModel';

type CreatedLike = Pick<TournamentSummaryDTO, 'id' | 'kind' | 'modules'>;

/** Where to land after creating a workspace: **Setup → Details**, where the
 *  venue, courts and the rest of the event definition are completed. Creation
 *  asks for a name, a date and the modules; Details is the next thing to do,
 *  and Overview (which reports readiness) has nothing to report yet.
 *
 *  A workspace with no enabled module at all opens on the Modules admin
 *  instead, so the operator can enable one before there's anything to set up.
 *
 *  Precondition: the blank/available-only guarantee holds only when `created.modules`
 *  is present. If it's absent (legacy pre-modules payload), we fall back to
 *  kind-derived modules — which always has one enabled module — so it lands on
 *  Setup. */
export function landingRoute(created: CreatedLike): string {
  const mods = created.modules ? modulesFromDto(created.modules) : modulesForWorkspace(created.kind);
  const anyEnabled = mods.some((m) => m.status === 'enabled');
  if (!anyEnabled) return `/tournaments/${created.id}/administration/modules`;
  return `/tournaments/${created.id}/setup/details`;
}
