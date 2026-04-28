/**
 * Per-device UI preferences — theme, density, etc.
 *
 * Deliberately separate from ``appStore`` so a tournament import/export
 * cannot clobber a director's UI choices. Lives under its own
 * localStorage key (``scheduler-app-preferences``) and is never touched
 * by import/export flows.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type DensityPreference = 'comfortable' | 'compact';

interface PreferencesState {
  theme: ThemePreference;
  density: DensityPreference;
  setTheme: (next: ThemePreference) => void;
  setDensity: (next: DensityPreference) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      density: 'comfortable',
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'scheduler-app-preferences',
      partialize: (state) => ({ theme: state.theme, density: state.density }),
    },
  ),
);
