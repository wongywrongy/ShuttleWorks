/**
 * Reads the stored density preference and reflects it onto ``<html>``
 * via the ``data-density`` attribute. CSS variables defined in
 * ``src/index.css`` (``--density-row-h``, ``--density-cell-py``, etc.)
 * pick up the value automatically.
 *
 * Mount once near the app root, alongside ``useAppliedTheme()``.
 */
import { useEffect } from 'react';
import { usePreferencesStore } from '../store/preferencesStore';

export function useAppliedDensity(): 'comfortable' | 'compact' {
  const density = usePreferencesStore((s) => s.density);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  return density;
}
