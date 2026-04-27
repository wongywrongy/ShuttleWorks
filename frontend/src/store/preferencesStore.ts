/**
 * Per-device UI preferences — theme, etc.
 *
 * Deliberately separate from ``appStore`` so a tournament import/export
 * cannot clobber a director's theme choice. Lives under its own
 * localStorage key (``scheduler-app-preferences``) and is never touched
 * by import/export flows.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

interface PreferencesState {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'scheduler-app-preferences',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
