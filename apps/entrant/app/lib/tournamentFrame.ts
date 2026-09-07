/**
 * The one tournament frame (contract `state-and-formatting.md` §11).
 *
 * Every tournament-scoped public route — Overview, Schedule, the Draws
 * index, a draw detail, Players, a tournament-scoped player page and
 * Regulations — renders inside the SAME breadcrumb / hero / tab-bar frame.
 * This module is where that frame is decided, once, as a pure function of
 * the public page projection plus the SSR instant; `components/
 * TournamentFrame.tsx` is where it is drawn.
 *
 * Why a model module rather than props on the component: before P1 the hero
 * existed twice (`tournament.tsx` and `schedule.tsx` each built their own,
 * with different metadata, a different status line and a freshness line only
 * one of them had), and three more routes had no hero at all and wore a
 * floating `← Tournament` link instead. §11.1's rule — "the hero is built
 * once, from one source" — is only true if there is literally one place that
 * turns `EntryPageDTO` into hero facts. That place is `tournamentFrameModel`.
 *
 * Nothing here does I/O or reads the clock: `nowMs` is a parameter, exactly
 * as in `phase.ts`, so an SSR render is deterministic.
 */
import type { EntryPageDTO } from './entryPage.types';
import { capChipCountdown, formatDateLong } from './format';
import {
  chipState,
  ctaState,
  nearestCloseAt,
  phaseLabel,
  tournamentPhase,
  visibleTabs,
  type ChipState,
  type CtaState,
} from './phase';

/** Every section the frame's one tab bar can name. */
export type FrameSection = 'overview' | 'schedule' | 'draws' | 'players' | 'documents';

export interface FrameTab {
  id: FrameSection;
  label: string;
  href: string;
}

/**
 * One breadcrumb segment. `href === null` marks the current page — the
 * frame renders it as text with `aria-current="page"`, never as a link
 * (§11.1).
 */
export interface Crumb {
  label: string;
  href: string | null;
}

export interface TournamentFrameModel {
  slug: string;
  orgName: string | null;
  title: string;
  /** Dates and venue, joined once. §11.1: the hero states them, the route does not. */
  metaLine: string;
  chip: ChipState;
  cta: CtaState;
  phaseAction: { label: string; href: string } | null;
  statusOverride: { label: string; live: boolean } | null;
  /**
   * §7.1 "venue-local presentation": the frame says this ONCE per
   * tournament, and public prose then prints bare venue-local dates and
   * times with no IANA identifier, offset or zone abbreviation.
   */
  timeNote: string | null;
  tabs: FrameTab[];
  active: FrameSection;
  crumbs: Crumb[];
}

export const VENUE_TIME_NOTE = 'All times local to the venue';

/** The tournament's own address, and the `?tab=` panels hanging off it. */
export function tournamentBase(slug: string): string {
  return `/e/${encodeURIComponent(slug)}`;
}

export function sectionHref(slug: string, section: FrameSection): string {
  const base = tournamentBase(slug);
  switch (section) {
    case 'overview':
      return base;
    case 'schedule':
      return `${base}/schedule`;
    case 'documents':
      return `${base}/regulations`;
    default:
      return `${base}?tab=${section}`;
  }
}

const SECTION_LABELS: Readonly<Record<FrameSection, string>> = Object.freeze({
  overview: 'Overview',
  schedule: 'Schedule',
  draws: 'Draws',
  players: 'Players',
  documents: 'Documents',
});

export function sectionLabel(section: FrameSection): string {
  return SECTION_LABELS[section];
}

/**
 * The tab bar's entries, in ADR 0028 order with Documents last.
 *
 * §11.2: a tab whose data does not exist is OMITTED, never rendered leading
 * to an empty page — `visibleTabs` already decides that for Draws and
 * Players, and Documents follows the same rule off the regulations text.
 */
export function frameTabs(page: EntryPageDTO): FrameTab[] {
  const slug = page.page.slug;
  const visible = visibleTabs(page.events, page.entrants, page.publication);
  const sections: FrameSection[] = ['overview', 'schedule'];
  if (visible.includes('draws')) sections.push('draws');
  if (visible.includes('players')) sections.push('players');
  if (page.page.regulationsText) sections.push('documents');
  return sections.map((section) => ({
    id: section,
    label: SECTION_LABELS[section],
    href: sectionHref(slug, section),
  }));
}

/**
 * The frame for one route.
 *
 * `trail` is what the route knows and the frame cannot: the draw's
 * discipline, the player's name. Everything above it — `Tournaments ›
 * {tournament}` — is the frame's, and the LAST segment of the whole trail is
 * always the current page. §11.2: a segment whose label cannot be derived
 * from real data is omitted rather than filled with a slug or a route name,
 * so an empty label drops out here.
 */
export function tournamentFrameModel(
  page: EntryPageDTO,
  options: { active: FrameSection; nowMs: number; trail?: readonly Crumb[] },
): TournamentFrameModel {
  const { active, nowMs, trail = [] } = options;
  const slug = page.page.slug;
  const base = tournamentBase(slug);
  const now = new Date(nowMs);
  const tournament = page.tournament as EntryPageDTO['tournament'] & {
    phase?: string | null;
    status?: string | null;
    timeZone?: string | null;
  };

  const tabs = frameTabs(page);
  const has = (section: FrameSection) => tabs.some((tab) => tab.id === section);

  const chip = capChipCountdown(
    chipState(page.events, now),
    nearestCloseAt(page.events),
    tournament.timeZone ?? 'UTC',
  );
  const cta = ctaState(page.events, slug);
  const phase = tournamentPhase({
    phase: tournament.phase,
    status: tournament.status,
    publication: page.publication,
    events: page.events,
  });
  const hasExplicitPhase = Boolean(tournament.phase || tournament.status);
  // Carried verbatim from `tournament.tsx`: the hero's action is the
  // tournament's lifecycle action, and it is the same one at every depth
  // (§11.1 "depth does not cost identity" — a draw page keeps the live CTA).
  const phaseAction =
    phase === 'entries_open'
      ? { label: 'Enter this tournament', href: `${base}/enter` }
      : phase === 'live' && has('draws')
        ? { label: 'Follow live matches', href: sectionHref(slug, 'schedule') }
        : phase === 'draws_published' && has('draws')
          ? { label: 'View draws', href: sectionHref(slug, 'draws') }
          : (phase === 'complete' || phase === 'archived') && has('draws')
            ? { label: 'View results', href: sectionHref(slug, 'draws') }
            : phase === 'entries_closed' && has('players')
              ? { label: 'View entrants', href: sectionHref(slug, 'players') }
              : phase === 'announced'
                ? { label: 'View tournament information', href: base }
                : null;

  const title = page.tournament.name ?? slug;
  const crumbs: Crumb[] = [{ label: 'Tournaments', href: '/e/' }];
  if (page.tournament.name) {
    crumbs.push({ label: page.tournament.name, href: base });
  }
  const tail: Crumb[] =
    trail.length > 0
      ? trail.filter((crumb) => crumb.label !== '')
      : active === 'overview'
        ? []
        : [{ label: SECTION_LABELS[active], href: sectionHref(slug, active) }];
  crumbs.push(...tail);
  // The last segment is the page the reader is on, whatever the caller
  // passed for it.
  const last = crumbs[crumbs.length - 1];
  if (last) crumbs[crumbs.length - 1] = { label: last.label, href: null };

  return {
    slug,
    orgName: page.org?.name === 'Local Workspace' ? null : (page.org?.name ?? null),
    title,
    metaLine: [page.tournament.date ? formatDateLong(page.tournament.date) : null, page.venue?.name]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    chip,
    cta,
    phaseAction: hasExplicitPhase ? phaseAction : null,
    statusOverride: hasExplicitPhase
      ? { label: phaseLabel(phase), live: phase === 'entries_open' || phase === 'live' }
      : null,
    timeNote: VENUE_TIME_NOTE,
    tabs,
    active,
    crumbs,
  };
}
