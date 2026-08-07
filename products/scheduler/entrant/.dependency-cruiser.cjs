/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'entrant-no-operator-frontend',
      comment:
        'The frontend/ analogue of platform-no-products. There is no platform/ layer in the SSR app, so the boundary that matters is the one spec §4 draws: the entrant tier must not reach into the operator SPA. Named case: frontend/src/api/client.ts is browser-coupled and unsafe in a shared node process — a Zustand toast singleton (:6, :397), a module-scoped stateEtags Map (:265), a module singleton export (:1682), withCredentials (:456), window.dispatchEvent on 401 (:384-391), and a relative base URL (:79). Module state shared across requests in one node process is a cross-entrant leak. Greenfield with 0 violations, so this is an error from day one.',
      severity: 'error',
      from: { path: '^app/' },
      to: { path: '[/\\\\]frontend[/\\\\]src[/\\\\]' },
    },
    {
      name: 'entrant-server-only-stays-server',
      comment:
        'The SSR-only fetch layer (*.server.ts) forwards no Cookie and relays no Set-Cookie (spec §3, §4). It must stay unreachable from anything that gets bundled to the browser, so client-reachable modules under app/components/ and app/routes/ may not import it — server modules are consumed through loaders and actions only. This is the seam that keeps "no deputy" enforceable rather than remembered.',
      severity: 'error',
      from: { path: '^app/(components|routes)/' },
      to: { path: '\\.server\\.(ts|tsx)$' },
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
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
};
