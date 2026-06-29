/**
 * The workspace left-sidebar navigation model — the single source of truth for
 * the in-workspace IA. Three tiers:
 *   - Tier 1: collapsible section triggers (Meet / Bracket / Operations /
 *     Display) with a role badge — landmarks, not destinations.
 *   - Tier 2: the nav items inside each section (the actual destinations).
 *   - Tier 3: Overview (always, top) + Workspace admin (always, bottom).
 *
 * A section appears only when its module is enabled (no coming-soon). The URL
 * segment is still the surface key (`uiStore.activeTab`); only Overview /
 * Display config / the `ws-*` admin sections are net-new shell surfaces — the
 * rest point at existing module segments. Operations points at the active
 * engine's schedule/live surfaces (single-engine ships now; the hybrid
 * cross-engine merge is a follow-on).
 */
import type { AppTab } from '../../store/uiStore';
import type { ModuleId } from '../../platform/product-shell/types';

export type WsKind = 'meet' | 'bracket' | null;
export type SectionRole = 'engine' | 'shared' | 'output';

export interface WsNavItem {
  segment: AppTab;
  label: string;
}
export interface WsSection {
  id: 'meet' | 'bracket' | 'operations' | 'display';
  label: string;
  role: SectionRole;
  items: WsNavItem[];
}
export interface WorkspaceNav {
  overview: WsNavItem;
  sections: WsSection[];
  admin: { label: string; items: WsNavItem[] };
}

/** Admin (WORKSPACE) segments — also drive the top-bar gear "active" indicator. */
export const ADMIN_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'ws-venue',
  'ws-members',
  'ws-sharing',
  'ws-modules',
  'ws-sync',
  'ws-settings',
]);

/** Segments rendered by the shell itself (Overview / Display config / admin). */
export const SHELL_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'overview',
  'display-config',
  ...ADMIN_SEGMENTS,
]);

export function isAdminSegment(tab: AppTab): boolean {
  return ADMIN_SEGMENTS.has(tab);
}

/** Default landing segment when a workspace opens. */
export const WORKSPACE_HOME: AppTab = 'overview';

const ROLE_LABEL: Record<SectionRole, string> = {
  engine: 'Engine',
  shared: 'Shared',
  output: 'Output',
};
export function roleBadge(role: SectionRole): string {
  return ROLE_LABEL[role];
}

export function buildWorkspaceNav(kind: WsKind, enabled: Set<ModuleId>): WorkspaceNav {
  const sections: WsSection[] = [];

  if (enabled.has('meet')) {
    sections.push({
      id: 'meet',
      label: 'Meet',
      role: 'engine',
      items: [
        { segment: 'roster', label: 'Roster' },
        { segment: 'matches', label: 'Matches' },
        { segment: 'setup', label: 'Configuration' },
      ],
    });
  }
  if (enabled.has('bracket')) {
    sections.push({
      id: 'bracket',
      label: 'Bracket',
      role: 'engine',
      items: [
        { segment: 'bracket-roster', label: 'Roster' },
        { segment: 'bracket-draws', label: 'Draws' },
        { segment: 'bracket-matches', label: 'Matches' },
        { segment: 'bracket-setup', label: 'Configuration' },
      ],
    });
  }
  if (enabled.has('meet') || enabled.has('bracket')) {
    const opsBracket =
      kind === 'bracket' || (!enabled.has('meet') && enabled.has('bracket'));
    sections.push({
      id: 'operations',
      label: 'Operations',
      role: 'shared',
      items: opsBracket
        ? [
            { segment: 'bracket-schedule', label: 'Plan' },
            { segment: 'bracket-live', label: 'Run' },
          ]
        : [
            { segment: 'schedule', label: 'Plan' },
            { segment: 'live', label: 'Run' },
          ],
    });
  }
  if (enabled.has('display')) {
    sections.push({
      id: 'display',
      label: 'Display',
      role: 'output',
      items: [
        { segment: 'tv', label: 'Preview' },
        { segment: 'display-config', label: 'Configuration' },
      ],
    });
  }

  return {
    overview: { segment: 'overview', label: 'Overview' },
    sections,
    admin: {
      label: 'Workspace',
      items: [
        { segment: 'ws-venue', label: 'Venue & schedule' },
        { segment: 'ws-members', label: 'Members' },
        { segment: 'ws-sharing', label: 'Sharing' },
        { segment: 'ws-modules', label: 'Modules' },
        { segment: 'ws-sync', label: 'Sync and backups' },
        { segment: 'ws-settings', label: 'Settings' },
      ],
    },
  };
}

/** The id of the section containing a segment (for accordion auto-open), or
 *  null when the segment is Overview / admin / not in a section. */
export function sectionOfSegment(nav: WorkspaceNav, segment: AppTab): WsSection['id'] | null {
  return nav.sections.find((s) => s.items.some((it) => it.segment === segment))?.id ?? null;
}
