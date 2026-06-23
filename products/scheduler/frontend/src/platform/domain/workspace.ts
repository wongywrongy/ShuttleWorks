/**
 * Workspace vocabulary facade.
 *
 * Phase 1 of the workspace-suite migration: the user-facing container noun
 * becomes "Workspace" while persistence, API routes (`/tournaments/*`), and DB
 * tables keep saying "tournament". This module is the single place the Hub and
 * shell chrome read the container noun, so a later, deeper rename touches one file.
 *
 * Scope rule (see docs/architecture/workspace-suite/import-boundaries.md, rule 4):
 * Hub + shell chrome only. Event-*kind* labels ("MEET" / "TOURNAMENT" badge) are a
 * separate concern and are NOT governed here.
 */
export const workspaceNoun = {
  /** lowercase singular — "workspace" */
  lower: 'workspace',
  /** Title-case singular — "Workspace" */
  title: 'Workspace',
  /** lowercase plural — "workspaces" */
  lowerPlural: 'workspaces',
  /** Title-case plural — "Workspaces" */
  titlePlural: 'Workspaces',
} as const;

export type WorkspaceNoun = typeof workspaceNoun;

/** User-facing copy for the Hub and shell chrome, derived from {@link workspaceNoun}. */
export const workspaceCopy = {
  dashboardDescription: `${workspaceNoun.titlePlural} you own or have been invited to.`,
  ownedSectionTitle: `Your ${workspaceNoun.lowerPlural}`,
  ownedEmptyHint: `You don't own any ${workspaceNoun.lowerPlural} yet.`,
  tabsAriaLabel: `${workspaceNoun.title} tabs`,
} as const;
