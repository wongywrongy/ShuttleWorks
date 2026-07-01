import * as React from 'react';

interface Module {
  /** Module label, e.g. "Meet". */
  name: string;
  /** Role tag: ENG (engine) · SHR (shared) · OUT (output). */
  role: 'ENG' | 'SHR' | 'OUT';
  /** Whether this module is expanded. */
  open?: boolean;
  /** Shared sub-pages, e.g. ["Roster","Matches","Configuration"]. */
  pages?: string[];
  /** Currently active sub-page. */
  active?: string;
}

/**
 * The module-grouped navigation rail. Modules collapse/expand; the open one
 * reveals its shared sub-page archetypes. This is the shell's spine.
 *
 * @startingPoint section="Navigation" subtitle="Module-grouped workspace rail" viewport="216x420"
 */
export interface WorkspaceSidebarProps {
  modules?: Module[];
  workspaceLinks?: string[];
  style?: React.CSSProperties;
}
export declare function WorkspaceSidebar(props: WorkspaceSidebarProps): JSX.Element;
