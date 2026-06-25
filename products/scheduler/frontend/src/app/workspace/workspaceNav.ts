/**
 * The workspace left-sidebar navigation model — the single source of truth for
 * the in-workspace IA (replaces the top ModuleDock + per-module TabBar).
 *
 * Sections map to the four concerns: configuration engines (Meet, Bracket),
 * Operations (running the day), Display (output), and Workspace (admin). A
 * module's group shows only when that module is enabled (no coming-soon). The
 * URL segment is still the surface key (`uiStore.activeTab`); most items point
 * at existing segments — Operations reuses the active engine's schedule/live
 * surfaces — and only Overview / Display config / the `ws-*` admin sections are
 * net-new shell surfaces.
 */
import type { AppTab } from '../../store/uiStore';
import type { ModuleId } from '../../platform/product-shell/types';

export type WsKind = 'meet' | 'bracket' | null;
export type WsGroupId = 'overview' | 'meet' | 'bracket' | 'operations' | 'display' | 'workspace';

export interface WsNavItem {
  segment: AppTab;
  label: string;
}
export interface WsNavGroup {
  id: WsGroupId;
  label: string | null; // null → no header (Overview)
  items: WsNavItem[];
}

/** Admin (WORKSPACE) segments — also drive the top-bar gear "active" indicator. */
export const ADMIN_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  'ws-members',
  'ws-sharing',
  'ws-modules',
  'ws-sync',
  'ws-settings',
]);

/** Segments rendered by the shell itself (Overview / Display config / admin),
 *  not by a module surface (MeetProduct / BracketProduct / DisplayProduct). */
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

/** Build the grouped sidebar for a workspace given its kind + enabled modules. */
export function buildWorkspaceNav(kind: WsKind, enabled: Set<ModuleId>): WsNavGroup[] {
  const groups: WsNavGroup[] = [
    { id: 'overview', label: null, items: [{ segment: 'overview', label: 'Overview' }] },
  ];

  if (enabled.has('meet')) {
    groups.push({
      id: 'meet',
      label: 'Meet',
      items: [
        { segment: 'setup', label: 'Configuration' },
        { segment: 'roster', label: 'Roster' },
        { segment: 'matches', label: 'Matches' },
      ],
    });
  }

  if (enabled.has('bracket')) {
    groups.push({
      id: 'bracket',
      label: 'Bracket',
      items: [
        { segment: 'bracket-setup', label: 'Configuration' },
        { segment: 'bracket-roster', label: 'Roster' },
        { segment: 'bracket-events', label: 'Events' },
        { segment: 'bracket-draw', label: 'Draw' },
      ],
    });
  }

  // Operations: the active engine's court×time view (Courts) + live score
  // control (Live). Single-engine ships now; the hybrid cross-engine merge is
  // a follow-on. Prefer the workspace kind; fall back to whichever engine is on.
  if (enabled.has('meet') || enabled.has('bracket')) {
    const opsBracket =
      kind === 'bracket' || (!enabled.has('meet') && enabled.has('bracket'));
    groups.push({
      id: 'operations',
      label: 'Operations',
      items: opsBracket
        ? [
            { segment: 'bracket-schedule', label: 'Courts' },
            { segment: 'bracket-live', label: 'Live' },
          ]
        : [
            { segment: 'schedule', label: 'Courts' },
            { segment: 'live', label: 'Live' },
          ],
    });
  }

  if (enabled.has('display')) {
    groups.push({
      id: 'display',
      label: 'Display',
      items: [
        { segment: 'tv', label: 'Preview' },
        { segment: 'display-config', label: 'Configuration' },
      ],
    });
  }

  groups.push({
    id: 'workspace',
    label: 'Workspace',
    items: [
      { segment: 'ws-members', label: 'Members' },
      { segment: 'ws-sharing', label: 'Sharing' },
      { segment: 'ws-modules', label: 'Modules' },
      { segment: 'ws-sync', label: 'Sync and backups' },
      { segment: 'ws-settings', label: 'Settings' },
    ],
  });

  return groups;
}
