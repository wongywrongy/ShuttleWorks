import type { TournamentSummaryDTO } from '../../api/dto';
import {
  modulesFromDto,
  modulesForWorkspace,
  primaryModuleForOpen,
  defaultTabForModule,
} from '../../platform/domain/moduleModel';

type CreatedLike = Pick<TournamentSummaryDTO, 'id' | 'kind' | 'modules'>;

/** Where to land after creating a workspace. A workspace with no enabled module
 *  (Blank / a fully-available Custom build) opens on Modules setup rather than
 *  silently opening an available operator. Otherwise opens its primary module tab. */
export function landingRoute(created: CreatedLike): string {
  const mods = created.modules ? modulesFromDto(created.modules) : modulesForWorkspace(created.kind);
  const anyEnabled = mods.some((m) => m.status === 'enabled');
  if (!anyEnabled) return `/tournaments/${created.id}/settings?tab=modules`;
  return `/tournaments/${created.id}/${defaultTabForModule(primaryModuleForOpen(mods))}`;
}
