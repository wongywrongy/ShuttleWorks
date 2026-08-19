/**
 * Interaction-audit error harness — dev/test builds only.
 *
 * Records (never swallows) every runtime failure signal so an automated
 * interaction sweep — or a developer — can read exactly what broke and which
 * interaction triggered it:
 *   - window `error` (uncaught exceptions)
 *   - window `unhandledrejection`
 *   - `console.error` calls (React warnings, swallowed catches that log)
 *   - React error-boundary catches (reported by ErrorBoundary via `record`)
 *
 * Each event carries the route, a timestamp, and the LAST USER INTERACTION
 * (element selector + accessible name, tracked via a capture-phase
 * pointerdown/keydown listener) so a failure can be attributed to the press
 * that caused it.
 *
 * Gating: installed from main.tsx only when `import.meta.env.DEV` or the
 * build was produced with `VITE_ERROR_HARNESS=1` (used by the Playwright
 * interaction sweep against a production build). Never active in a normal
 * production build. The harness only observes — original console/error
 * behavior is preserved.
 */

export interface HarnessInteraction {
  /** Short CSS-ish path of the pressed element (tag/id/data-testid chain). */
  selector: string;
  /** Accessible name: aria-label, else trimmed text content, else title. */
  name: string;
  ts: number;
}

export interface HarnessEvent {
  kind: 'error' | 'unhandledrejection' | 'console.error' | 'boundary';
  message: string;
  stack?: string;
  /** React component stack (boundary events only). */
  componentStack?: string;
  route: string;
  /** The interaction most recently observed before the failure, if any. */
  interaction: HarnessInteraction | null;
  /** Monotonic id — doubles as the "state snapshot id" for sweep reports. */
  seq: number;
  ts: number;
}

export interface ErrorHarness {
  events: HarnessEvent[];
  /** Record an event (used by ErrorBoundary; also callable from tests). */
  record: (e: Omit<HarnessEvent, 'route' | 'interaction' | 'seq' | 'ts'>) => void;
  /** Drop accumulated events (the sweep clears between presses). */
  clear: () => void;
  lastInteraction: () => HarnessInteraction | null;
}

declare global {
  interface Window {
    __swErrorHarness?: ErrorHarness;
  }
}

const MAX_EVENTS = 500;

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labelled = el.getAttribute('aria-labelledby');
  if (labelled) {
    const ref = document.getElementById(labelled);
    if (ref?.textContent?.trim()) return ref.textContent.trim();
  }
  const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ');
  if (text) return text.slice(0, 80);
  const title = el.getAttribute('title');
  if (title) return title;
  return '';
}

function shortSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 4; depth++) {
    let part = cur.tagName.toLowerCase();
    const testId = cur.getAttribute('data-testid');
    if (cur.id) {
      parts.unshift(`${part}#${cur.id}`);
      break;
    }
    if (testId) {
      parts.unshift(`${part}[data-testid="${testId}"]`);
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

export function installErrorHarness(): ErrorHarness {
  if (window.__swErrorHarness) return window.__swErrorHarness;

  const events: HarnessEvent[] = [];
  let seq = 0;
  let lastInteraction: HarnessInteraction | null = null;

  const push = (e: Omit<HarnessEvent, 'route' | 'interaction' | 'seq' | 'ts'>) => {
    if (events.length >= MAX_EVENTS) events.shift();
    events.push({
      ...e,
      route: window.location.pathname + window.location.search,
      interaction: lastInteraction,
      seq: seq++,
      ts: Date.now(),
    });
  };

  const trackInteraction = (ev: Event) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const el =
      target.closest('button, [role="button"], a, input, select, [role="menuitem"], [role="tab"], [role="switch"], [draggable]') ??
      target;
    lastInteraction = { selector: shortSelector(el), name: accessibleName(el), ts: Date.now() };
  };
  window.addEventListener('pointerdown', trackInteraction, { capture: true });
  window.addEventListener('keydown', trackInteraction, { capture: true });

  window.addEventListener('error', (ev) => {
    push({
      kind: 'error',
      message: ev.message || String(ev.error ?? 'unknown error'),
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason: unknown = ev.reason;
    push({
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push({
      kind: 'console.error',
      message: args
        .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : String(a)))
        .join(' ')
        .slice(0, 2000),
    });
    originalConsoleError(...args);
  };

  const harness: ErrorHarness = {
    events,
    record: push,
    clear: () => {
      events.length = 0;
    },
    lastInteraction: () => lastInteraction,
  };
  window.__swErrorHarness = harness;
  return harness;
}

/** True when the current build should carry the harness. */
export function errorHarnessEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ERROR_HARNESS === '1';
}
