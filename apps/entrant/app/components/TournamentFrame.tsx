/**
 * The one tournament frame (contract §11), drawn.
 *
 * Breadcrumbs, hero and tab bar, composed once and rendered identically by
 * Overview, Schedule, the Draws index, a draw detail, Players, a
 * tournament-scoped player page and Regulations. A route hands it the public
 * page projection, the SSR instant, which section it is in, and — only where
 * the frame cannot know it — the tail of the breadcrumb trail (a draw's
 * discipline, a player's name).
 *
 * Everything else is decided in `lib/tournamentFrame.ts`, so no route can
 * quietly grow a second hero, a second tab system, its own back link or its
 * own restatement of the tournament timezone: it has no props to do it with.
 */
import type { EntryPageDTO } from '../lib/entryPage.types';
import { tournamentFrameModel, type Crumb, type FrameSection } from '../lib/tournamentFrame';
import { Breadcrumbs } from './Breadcrumbs';
import { HeroHeader } from './HeroHeader';
import { TabBar } from './TabBar';

export function TournamentFrame({
  page,
  nowMs,
  active,
  trail,
}: {
  page: EntryPageDTO;
  /** SSR render instant, ms — the frame never reads the clock itself. */
  nowMs: number;
  active: FrameSection;
  trail?: readonly Crumb[];
}) {
  const frame = tournamentFrameModel(page, { active, nowMs, trail });
  return (
    <HeroHeader
      orgName={frame.orgName}
      title={frame.title}
      metaLine={frame.metaLine}
      chip={frame.chip}
      cta={frame.cta}
      phaseAction={frame.phaseAction}
      statusOverride={frame.statusOverride}
      timeNote={frame.timeNote}
      breadcrumbs={<Breadcrumbs crumbs={frame.crumbs} />}
    >
      <TabBar tabs={frame.tabs} active={frame.active} />
    </HeroHeader>
  );
}
