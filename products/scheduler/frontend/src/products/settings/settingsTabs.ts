export type SettingsTabId =
  | 'overview'
  | 'general'
  | 'modules'
  | 'people'
  | 'sharing'
  | 'sync'
  | 'danger';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

/** The Workspace Settings center tabs, in display order. Overview is the
 *  default landing tab. (Appearance was removed — it was a dead placeholder.) */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'general', label: 'General' },
  { id: 'modules', label: 'Modules' },
  { id: 'people', label: 'People & Access' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'sync', label: 'Sync & Backups' },
  { id: 'danger', label: 'Danger Zone' },
];
