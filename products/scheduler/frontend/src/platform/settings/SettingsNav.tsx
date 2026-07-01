/**
 * Settings section descriptor — the shape each settings section declares
 * (id, label, optional icon/hint), consumed by `SettingsSectionDef`.
 *
 * The `SettingsNav` rail component that lived here was removed with the
 * dead `SettingsShell` in SP-REFACTOR Phase 5 (no importers).
 */
import type { Icon } from '@phosphor-icons/react';

export interface SettingsSection {
  id: string;
  label: string;
  icon?: Icon;
  hint?: string;
}
