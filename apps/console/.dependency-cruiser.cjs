/**
 * Console architecture boundaries.
 *
 * SP-REORG-1 Phase 4 renamed `src/products/` to `src/modules/` (the product's
 * own architecture vocabulary — ADR 0001 calls them modules, and so does every
 * other layer: `ModuleId`, `moduleContract.ts`, `buildWorkspaceNav`) and
 * ratcheted the cross-module rule from a blanket warning to per-edge config.
 *
 * ---------------------------------------------------------------------------
 * THE RATCHET
 *
 * The old rule warned on EVERY cross-module edge, which meant a new coupling
 * introduced today looked exactly like a two-year-old one nobody had ruled on.
 * A warning that cannot distinguish those is not a signal, it is a number.
 *
 * There are now two rules over the same boundary:
 *
 *   no-cross-module          ERROR   any edge from a file not named below
 *   no-cross-module-debt     WARN    the three known clusters, enumerated
 *
 * So a NEW cross-module import fails the build, while the sixteen existing
 * edges stay visible and un-fixed — this program is behaviour-preserving and
 * clearing them is a design decision, not a path update (debt-log D3, ADR 0011).
 *
 * Deleting an entry from KNOWN_CROSS_MODULE below is how a cluster gets
 * retired: fix the edges, delete the line, and the error rule covers it. The
 * list is the ratchet.
 * ---------------------------------------------------------------------------
 */

/**
 * The three clusters that exist today, by SOURCE. Each is a decision owed, not
 * an oversight — see debt-log D3.
 *
 *  1. workspace -> settings   an aggregator edge: WorkspaceShellSurface hosts
 *                             the six settings tabs it renders.
 *  2. workspace -> display    the display-config board reuses the public
 *                             board's real renderer, for visual fidelity.
 *  3. operations -> bracket   the genuine debt: Operations reaches into
 *                             Bracket's UI (MatchDetailPanel,
 *                             BracketScheduleModal, bracketLabels). Note the
 *                             API has NO such edge — import-linter contract 4
 *                             pins its absence — so this is a console-only
 *                             coupling that the backend seam map does not have.
 */
// The module name is a CAPTURE GROUP in every entry, and that is load-bearing:
// the debt rule below excludes same-module imports with `^src/modules/$1/`, and
// `$1` binds to group 1 of the `from` pattern that matched. Written without the
// group, the rule reported every internal import these six files make -- 51
// warnings instead of 16 -- which reads as a boundary problem and is not one.
const KNOWN_CROSS_MODULE = [
  '^src/modules/(workspace)/WorkspaceShellSurface[.]tsx$',
  '^src/modules/(workspace)/displayConfig/',
  '^src/modules/(operations)/OperationsProduct[.]tsx$',
  '^src/modules/(operations)/OpsDetailRail[.]tsx$',
  '^src/modules/(operations)/opsBlock[.]ts$',
  '^src/modules/(operations)/run/RunSurface[.]tsx$',
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'platform-no-modules',
      comment:
        'platform/ is the foundation layer: it must not import feature modules or page layouts. This boundary is clean today (0 violations) — kept as an error to lock it in.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(modules|pages)/' },
    },
    {
      name: 'platform-no-app',
      comment:
        'platform/ should not import the app shell/orchestration layer (app/) — that inverts the dependency direction. Previously 3 violations (WorkspaceShell + WorkspaceSidebar + a contract test all imported app/workspace/workspaceNav); resolved by relocating the shared nav config to platform/product-shell/workspaceNav. Now 0 violations — locked to error.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'no-cross-module',
      comment:
        'A module must not import another module\'s internals. ERROR, because every edge that exists today is enumerated in KNOWN_CROSS_MODULE at the top of this file and excluded here — so anything this rule catches is NEW. Shared code belongs in components/, hooks/, lib/, store/, api/ or platform/ (the SourceChip precedent: used by three modules, so it lives in components/).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: KNOWN_CROSS_MODULE },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/'] },
    },
    {
      name: 'no-cross-module-debt',
      comment:
        'The sixteen cross-module edges that predate the ratchet, in three clusters (workspace->settings, workspace->display, operations->bracket). WARN so they stay visible without blocking; each is a design decision owed, not an oversight — debt-log D3 and ADR 0011. Retiring a cluster means fixing its edges and deleting its line from KNOWN_CROSS_MODULE, after which the error rule above covers it.',
      severity: 'warn',
      from: { path: KNOWN_CROSS_MODULE },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/'] },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make refactoring unsafe.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
};
