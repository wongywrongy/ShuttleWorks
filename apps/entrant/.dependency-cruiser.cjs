/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'entrant-no-operator-frontend',
      comment:
        'The console/ analogue of platform-no-products. There is no platform/ layer in the SSR app, so the boundary that matters is the one spec §4 draws: the entrant tier must not reach into the operator SPA. Named case: apps/console/src/api/client.ts is browser-coupled and unsafe in a shared node process — a Zustand toast singleton (:6, :397), a module-scoped stateEtags Map (:265), a module singleton export (:1682), withCredentials (:456), window.dispatchEvent on 401 (:384-391), and a relative base URL (:79). Module state shared across requests in one node process is a cross-entrant leak. Greenfield with 0 violations, so this is an error from day one. `to.reachable: true` for the same reason as entrant-server-only-stays-server: a plain path match only catches a direct import, and a re-export barrel one hop away would otherwise sail through.',
      severity: 'error',
      from: { path: '^app/' },
      // SP-REORG-1: `frontend` -> `console`. This literal is the whole rule.
      // The operator SPA moved from products/scheduler/frontend to
      // apps/console, and a path regex naming a directory that no longer
      // exists matches nothing - the rule would have kept reporting zero
      // violations forever while enforcing nothing, which is the one failure
      // mode a boundary gate must not have. apps/entrant/tests/boundaries.test.ts
      // proves it still fires by planting a real violation.
      to: { path: '[/\\\\]console[/\\\\]src[/\\\\]', reachable: true },
    },
    {
      name: 'entrant-server-only-stays-server',
      comment:
        'The SSR-only fetch layer (*.server.ts) forwards no Cookie and relays no Set-Cookie (spec §3, §4). It must stay unreachable from anything that gets bundled to the browser, so client-reachable modules under app/components/ may not import it. `to.reachable: true` is load-bearing: a plain `to.path` match only catches a DIRECT import, so a one-hop re-export barrel (app/lib/foo.ts importing app/lib/bar.server.ts, then a component importing foo.ts) would sail through undetected. reachable walks the full transitive graph. NARROWED in Task 15, from `^app/(components|routes)/`: in React Router 7 framework mode a loader can ONLY live in a route module, so "routes may not import *.server" forbids the single sanctioned way to reach the API and has no compliant alternative. Routes are not left unguarded — React Router enforces the same property at EXPORT granularity, which is strictly stronger than this module-granularity rule: `react-router build` hard-fails with "Server-only module referenced by client — \'../lib/apiFetch.server\' imported by route \'app/routes/entry.tsx\' … other route exports depend on it", stripping the import when only loader/action/middleware/headers use it. That build is a required CI step (see the entrant job) and the client bundle was verified free of the server module. app/components/ has no such mechanism, which is why the rule stays there.',
      severity: 'error',
      from: { path: '^app/components/' },
      to: { path: '\\.server\\.(ts|tsx)$', reachable: true },
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
