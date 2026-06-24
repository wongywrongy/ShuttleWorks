import { useEffect } from 'react';
import { useUiStore } from '../../../store/uiStore';
import { useDisruptions } from './useDisruptions';

/**
 * Publishes the meet disruption summary into the neutral `uiStore` slice so the
 * shared `TabBar` badge can read counts without the shell depending on meet
 * validation. Mounted by `MeetProduct`; resets the summary to zero on unmount
 * (e.g. switching to Bracket/Display) so no stale meet counts linger.
 */
export function useDisruptionPublisher(): void {
  const { total, errors, warnings, severity } = useDisruptions();
  const setDisruptionSummary = useUiStore((s) => s.setDisruptionSummary);

  useEffect(() => {
    setDisruptionSummary({ total, errors, warnings, severity });
  }, [total, errors, warnings, severity, setDisruptionSummary]);

  useEffect(() => {
    return () =>
      setDisruptionSummary({ total: 0, errors: 0, warnings: 0, severity: null });
  }, [setDisruptionSummary]);
}
