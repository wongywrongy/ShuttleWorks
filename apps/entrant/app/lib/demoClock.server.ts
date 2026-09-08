/** One guarded clock seam for public SSR's user-visible relative states. */
function parseDemoNow(raw: string | undefined, environment: string | undefined): number | null {
  if (!raw) return null;
  if ((environment ?? 'local').trim().toLowerCase() !== 'local') {
    throw new Error('SHUTTLEWORKS_DEMO_NOW is allowed only when ENVIRONMENT=local');
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim())) {
    throw new Error('SHUTTLEWORKS_DEMO_NOW must be an ISO-8601 datetime with a UTC offset');
  }
  return parsed;
}

export function demoNowMs(): number {
  return parseDemoNow(process.env.SHUTTLEWORKS_DEMO_NOW, process.env.ENVIRONMENT) ?? Date.now();
}

export function demoNow(): Date { return new Date(demoNowMs()); }

export { parseDemoNow };
