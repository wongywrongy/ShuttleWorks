export type SettingsTabId =
  | 'general'
  | 'modules'
  | 'people'
  | 'sharing'
  | 'sync'
  | 'appearance'
  | 'danger';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

/** The Workspace Settings center tabs, in display order. */
export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'modules', label: 'Modules' },
  { id: 'people', label: 'People & Access' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'sync', label: 'Sync & Backups' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'danger', label: 'Danger Zone' },
];
