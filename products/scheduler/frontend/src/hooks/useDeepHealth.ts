/**
 * Deep readiness probe for the backend.
 *
 * Hits `GET /health/deep` directly (not through `apiClient`) so the
 * shared axios error interceptor doesn't blast the toast stack — the
 * `AppStatusPopover` surfaces the failure inline. Poll lifecycle stays
 * on the consumer: `refresh()` is a stable callback the popover wires
 * to its open/refresh handlers.
 */
import { useCallback, useState } from 'react';

interface DeepHealth {
  status: 'healthy' | 'degraded';
  version: string;
  schemaVersion: number;
  dataDirWritable: boolean;
  solverLoaded: boolean;
  dataDirError: string | null;
  solverError: string | null;
  requestId: string | null;
}

function deepHealthUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? '/api' : 'http://localhost:8000');
  return `${base}/health/deep`;
}

export interface DeepHealthState {
  health: DeepHealth | null;
  error: string | null;
  /**
   * The deployment gates `/health/deep` behind its operational token
   * (403). Distinct from `error` on purpose: the backend is answering
   * perfectly well, it just doesn't hand worker ids and schema
   * revisions to a browser. Rendering that as a failure would paint a
   * permanent red "unreachable" on a healthy cloud deployment.
   */
  restricted: boolean;
  refresh: () => Promise<void>;
}

export function useDeepHealth(): DeepHealthState {
  const [health, setHealth] = useState<DeepHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(deepHealthUrl());
      if (res.status === 403) {
        setRestricted(true);
        setHealth(null);
        return;
      }
      if (!res.ok) throw new Error(`health ${res.status}`);
      setRestricted(false);
      setHealth((await res.json()) as DeepHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
      setHealth(null);
    }
  }, []);

  return { health, error, restricted, refresh };
}
