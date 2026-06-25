/** Post-create navigation for the `/new` route: maps the backend-returned
 *  workspace to the route it should open on. */
import type { TournamentSummaryDTO } from '../../api/dto';
import {
  modulesFromDto,
  modulesForWorkspace,
  primaryModuleForOpen,
  defaultTabForModule,
} from '../../platform/domain/moduleModel';

type CreatedLike = Pick<TournamentSummaryDTO, 'id' | 'kind' | 'modules'>;

/** Where to land after creating a workspace. Derived from `created.modules` (the
 *  backend-echoed seed): a workspace with no enabled module (Blank / a fully-available
 *  Custom build) opens on Modules setup rather than silently opening an available
 *  operator; otherwise it opens its primary module tab.
 *
 *  Precondition: the blank/available-only guarantee holds only when `created.modules`
 *  is present. If it's absent (legacy pre-modules payload), we fall back to
 *  kind-derived modules — which always has one enabled module — so the route is the
 *  primary module tab. A backend that accepts `modules[]` on create echoes them back. */
export function landingRoute(created: CreatedLike): string {
  const mods = created.modules ? modulesFromDto(created.modules) : modulesForWorkspace(created.kind);
  const anyEnabled = mods.some((m) => m.status === 'enabled');
  if (!anyEnabled) return `/tournaments/${created.id}/settings?tab=modules`;
  return `/tournaments/${created.id}/${defaultTabForModule(primaryModuleForOpen(mods))}`;
}
