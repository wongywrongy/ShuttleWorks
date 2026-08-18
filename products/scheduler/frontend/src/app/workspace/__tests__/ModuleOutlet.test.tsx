import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleOutlet } from '../ModuleOutlet';
import { useUiStore } from '../../../store/uiStore';

vi.mock('../../../products/meet/MeetProduct', () => ({
  MeetProduct: () => <div data-testid="meet-product" />,
}));
vi.mock('../../../products/bracket/BracketProduct', () => ({
  BracketProduct: () => <div data-testid="bracket-product" />,
}));
vi.mock('../../../products/display/DisplayProduct', () => ({
  DisplayProduct: () => <div data-testid="display-product" />,
}));
vi.mock('../../../products/operations/OperationsProduct', () => ({
  OperationsProduct: () => <div data-testid="operations-product" />,
}));
vi.mock('../../../products/entries/EntriesProduct', () => ({
  EntriesProduct: () => <div data-testid="entries-product" />,
}));

function setTabAndKind(tab: string, kind: 'meet' | 'bracket' | null) {
  useUiStore.getState().setActiveTab(tab as never);
  useUiStore.getState().setActiveTournamentKind(kind);
}

describe('ModuleOutlet', () => {
  beforeEach(() => setTabAndKind('setup', 'meet'));

  // Products are lazy()-loaded behind Suspense (PERF_FINDINGS FIX A), so
  // the mounted product appears asynchronously — assert with findByTestId.
  it('renders MeetProduct for a meet operator tab', async () => {
    // A non-Operations meet tab: since the B3 flip, 'schedule'/'live' route
    // to the unified Operations surface (covered below).
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });

  it('renders DisplayProduct for the tv tab', async () => {
    setTabAndKind('tv', 'meet');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('display-product')).toBeInTheDocument();
  });

  it('renders BracketProduct for a bracket tab', async () => {
    setTabAndKind('bracket-draw', 'bracket');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('bracket-product')).toBeInTheDocument();
  });

  it('renders EntriesProduct for the entries tab, on either kind', async () => {
    // The outlet's final `else` is MeetProduct, so an unrouted module id
    // renders the Meet product under someone else's URL — this is the
    // assertion that catches that, and the AppShell guard is what catches it
    // for a module this workspace does not have at all.
    setTabAndKind('entries', 'bracket');
    render(<ModuleOutlet />);
    expect(await screen.findByTestId('entries-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bracket-product')).not.toBeInTheDocument();
  });

  // --- Unified Operations (SP-CONSOLE-4 B3 flip) ---------------------------
  // Every Operations segment routes to OperationsProduct regardless of how
  // many engines the workspace runs; `engines` only shapes its actions.

  it('single-engine meet: an operations tab renders the unified OperationsProduct', async () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: false }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('single-engine bracket: the bracket operations tab renders the unified surface', async () => {
    setTabAndKind('bracket-live', 'bracket');
    render(<ModuleOutlet engines={{ meet: false, bracket: true }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('bracket-product')).not.toBeInTheDocument();
  });

  it('both engines: an operations tab renders the unified OperationsProduct', async () => {
    setTabAndKind('schedule', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: true }} />);
    expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-product')).not.toBeInTheDocument();
  });

  it('a non-operations tab still renders its own engine', async () => {
    setTabAndKind('roster', 'meet');
    render(<ModuleOutlet engines={{ meet: true, bracket: true }} />);
    expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
  });

  // --- VITE_LEGACY_OPS escape hatch (deleted at B4) ------------------------

  it('legacy flag: a single-engine operations tab falls back to the engine product', async () => {
    vi.stubEnv('VITE_LEGACY_OPS', '1');
    try {
      setTabAndKind('schedule', 'meet');
      render(<ModuleOutlet engines={{ meet: true, bracket: false }} />);
      expect(await screen.findByTestId('meet-product')).toBeInTheDocument();
      expect(screen.queryByTestId('operations-product')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('legacy flag: both engines still get the unified surface (pre-flip behavior)', async () => {
    vi.stubEnv('VITE_LEGACY_OPS', '1');
    try {
      setTabAndKind('schedule', 'meet');
      render(<ModuleOutlet engines={{ meet: true, bracket: true }} />);
      expect(await screen.findByTestId('operations-product')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// --- VITE_LEGACY_OPS grep guard (SP-CONSOLE-4 B3) --------------------------
// The flag dies with the legacy pages at B4, so it must stay a ONE-file
// grep: routing decisions belong in ModuleOutlet only. A second usage site
// would silently outlive the deletion sweep.
describe('VITE_LEGACY_OPS stays confined to ModuleOutlet', () => {
  const SRC = resolve(fileURLToPath(import.meta.url), '../../../..');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it('no source file other than ModuleOutlet mentions the flag', () => {
    const offenders = walk(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('VITE_LEGACY_OPS'))
      .map((f) => f.split('\\').join('/'))
      .filter((f) => !f.endsWith('app/workspace/ModuleOutlet.tsx') && !f.includes('__tests__'));
    expect(offenders).toEqual([]);
  });

  it('ModuleOutlet itself still carries the guarded fallback (guard has a subject)', () => {
    const outlet = readFileSync(
      resolve(SRC, 'app/workspace/ModuleOutlet.tsx'),
      'utf8',
    );
    expect(outlet).toContain('VITE_LEGACY_OPS');
  });
});
