/**
 * Settings section definition — the shape each settings section (Setup,
 * Roster, Events, …) declares for a settings shell/tab to render.
 *
 * The two-zone `SettingsShell` component that previously lived here was
 * removed as dead code (no importers) in SP-REFACTOR Phase 5 — see
 * REFACTOR_PROGRESS.md / docs/audits/debt-log.md. Only the section-def
 * type is still consumed (e.g. by BracketTab).
 */
import { type SettingsSection } from './SettingsNav';

export interface SettingsSectionDef extends SettingsSection {
  /** Title rendered as the bold subject in the operator header strip.
   *  Defaults to `label`. */
  title?: string;
  /** Optional muted-context line shown after the title in the header
   *  strip — typically dropped on Settings since each section is
   *  already named in the rail. */
  description?: string;
  /** Section content. */
  render: () => React.ReactNode;
}
