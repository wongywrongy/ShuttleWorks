/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'platform-no-products',
      comment:
        'platform/ is the foundation layer: it must not import feature products or page layouts. This boundary is clean today (0 violations) — kept as an error to lock it in.',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(products|pages)/' },
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
      name: 'no-cross-product',
      comment:
        'Products should not import each others internals. Starts as warn: 16 known violations across 3 buckets — (1) workspace -> settings/hub is a legit aggregator edge, (2) operations/SourceChip + meet EVENT_LABEL are misplaced shared code to relocate, (3) operations <-> bracket coupling is the real debt. Ratchet to error after cleanup.',
      severity: 'warn',
      from: { path: '^src/products/([^/]+)/' },
      to: { path: '^src/products/([^/]+)/', pathNot: ['^src/products/$1/'] },
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
