import type { WorkspaceModuleDTO } from '../../api/dto';

export type TemplateId = 'meet-day' | 'bracket-tournament' | 'hybrid' | 'blank' | 'custom';

export const MODULE_LABELS: Record<WorkspaceModuleDTO['moduleId'], string> = {
  meet: 'Meet',
  bracket: 'Bracket',
  display: 'Display',
};

export interface Template {
  id: TemplateId;
  title: string;
  blurb: string;
  kind: 'meet' | 'bracket';
  /** Explicit module seed persisted on create (sent as `modules[]`). The landing
   *  route is derived from the returned modules (see workspaceCreateFlow). */
  seed: WorkspaceModuleDTO[];
}

export const seed = (
  moduleId: WorkspaceModuleDTO['moduleId'],
  status: WorkspaceModuleDTO['status'],
): WorkspaceModuleDTO => ({ moduleId, status, config: null });

/** The four preset templates. Custom is handled separately (no preset seed). */
export const TEMPLATES: Template[] = [
  {
    id: 'meet-day',
    title: 'Meet Day',
    blurb: 'Roster, CP-SAT schedule, live cockpit, and a venue display.',
    kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'available'), seed('display', 'enabled')],
  },
  {
    id: 'bracket-tournament',
    title: 'Bracket Tournament',
    blurb: 'Events, seeding, draw generation, advancement, and results.',
    kind: 'bracket',
    seed: [seed('bracket', 'enabled'), seed('meet', 'available'), seed('display', 'available')],
  },
  {
    id: 'hybrid',
    title: 'Hybrid Event',
    blurb: 'Meet and Bracket modules together in one workspace, plus a display.',
    kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'enabled'), seed('display', 'enabled')],
  },
  {
    id: 'blank',
    title: 'Blank Workspace',
    blurb: 'Start empty and turn on modules from Settings as you go.',
    kind: 'meet',
    seed: [seed('meet', 'available'), seed('bracket', 'available'), seed('display', 'disabled')],
  },
];
