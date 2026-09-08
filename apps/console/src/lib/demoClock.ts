/** Stable clock for the private demo; unset builds use the real clock. */
function parseDemoNow(raw: string | undefined, environment: string | undefined): number | null {
  if (!raw) return null;
  if ((environment ?? 'production').trim().toLowerCase() !== 'local') {
    throw new Error('VITE_DEMO_NOW is allowed only when VITE_ENVIRONMENT=local');
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim())) {
    throw new Error('VITE_DEMO_NOW must be an ISO-8601 datetime with a UTC offset');
  }
  return parsed;
}

export function demoNowMs(fallbackMs: number = Date.now()): number {
  return parseDemoNow(import.meta.env.VITE_DEMO_NOW, import.meta.env.VITE_ENVIRONMENT) ?? fallbackMs;
}

export function demoNow(fallback?: Date): Date { return new Date(demoNowMs(fallback?.getTime())); }

export { parseDemoNow };
