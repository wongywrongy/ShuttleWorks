import { defineConfig } from 'vitepress'
import { BRAND } from '../../packages/brand/generated'
import { execFileSync } from 'node:child_process'

// Build-time provenance stamp: which commit this docs build was generated from.
// Three one-off git calls at config load (NOT per page), so it adds nothing to
// the per-page build cost. Shown in the footer so a reader can see how fresh
// the site is; pair it with `npm run docs:freshness` to detect code drift.
function gitStamp() {
  const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  try {
    return {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      sha: git(['rev-parse', '--short', 'HEAD']),
      date: git(['log', '-1', '--format=%cs']),
    }
  } catch {
    return null
  }
}
const STAMP = gitStamp()

// ShuttleWorks documentation — the single source of truth for architecture,
// module contracts, and data flow.
//
// `srcDir` is the docs/ directory itself (the default when VitePress is run as
// `vitepress build docs`). `outDir` is docs/.vitepress/dist. The dead-link
// checker is left ON (`ignoreDeadLinks: false`) on purpose — a broken internal
// link should fail `docs:build`, which is our verification gate.
//
export default defineConfig({
  title: BRAND.productName,
  description:
    `Architecture, module contracts, and data flow for ${BRAND.productName} by ${BRAND.companyName} — a CP-SAT tournament scheduling control plane (Entries · Meet · Bracket · Operations · Display) with an SSR-first public entrant tier and bounded same-origin route modules.`,
  lang: 'en-US',

  srcDir: '.',
  outDir: './.vitepress/dist',
  cleanUrls: true,

  // --- Performance ---------------------------------------------------------
  // Extract per-page metadata into a shared async chunk instead of inlining it
  // into every page's HTML. Smaller HTML payloads + the metadata is fetched
  // once and cached across navigations. Recommended as the page count grows.
  metaChunk: true,

  // `lastUpdated` is intentionally OFF for build speed: enabling it spawns a
  // `git log` per page (~0.4s here, ~17% of build time, and it scales linearly
  // with the number of pages). Flip to `true` if you want "Last updated"
  // timestamps in the footer and can spend the extra time.
  lastUpdated: false,

  // Fail the build on broken INTERNAL links — this is the verification gate.
  // The array form keeps dead-link checking ON for every link except the
  // intentional `http://localhost:*` references to the running dev servers
  // (Swagger UI on :8000/docs, the Vite dev server on :5173), which VitePress
  // cannot reach at build time and would otherwise flag.
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  // Repository metadata is not a reader-facing site page.
  srcExclude: [
    'README.md',
  ],

  // Skip Vite's gzip-compressed-size report pass during the build — it gzips
  // every emitted asset just to print a "gzip: x KB" column. Dropping it
  // trims build time with no effect on output. (Server already gzips on the
  // wire; the report was informational only.)
  vite: {
    build: { reportCompressedSize: false },
  },

  themeConfig: {
    // Four quadrants, in the order a reader meets them: learn, do, look up,
    // understand. Nothing else is a top-level destination. Architecture,
    // Modules, Contracts and API used to be four separate nav entries for
    // what are two quadrants, which asked the reader to know our filing
    // system before they could find anything.
    // Four quadrants, in the order a reader meets them: learn, do, look up,
    // understand. Nothing else is a top-level destination. Architecture,
    // Modules, Contracts and API used to be four separate nav entries for
    // what are two quadrants, which asked the reader to know our filing
    // system before they could find anything.
    nav: [
      { text: 'Tutorials', link: '/tutorials/quickstart' },
      { text: 'How-to', link: '/how-to/' },
      { text: 'Reference', link: '/reference/modules/meet' },
      { text: 'Explanation', link: '/explanation/what-is-shuttleworks' },
      { text: 'Glossary', link: '/reference/glossary' },
    ],

    sidebar: [
      {
        text: 'Tutorials - learning by doing',
        collapsed: false,
        items: [
          { text: 'Quickstart', link: '/tutorials/quickstart' },
          { text: 'Build a module', link: '/tutorials/build-a-module' },
        ],
      },
      {
        text: 'How-to - extending',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/how-to/' },
          { text: 'Add a module', link: '/how-to/add-a-module' },
          { text: 'Add a surface', link: '/how-to/add-a-surface' },
          { text: 'Add an API endpoint', link: '/how-to/add-an-api-endpoint' },
          { text: 'Add a CP-SAT constraint', link: '/how-to/add-a-cpsat-constraint' },
          { text: 'Wire a seam', link: '/how-to/wire-a-seam' },
          { text: 'Enable a module', link: '/how-to/enable-a-module' },
          { text: 'Build on the engine', link: '/how-to/build-on-the-engine' },
        ],
      },
      {
        text: 'How-to - running and deploying',
        collapsed: false,
        items: [
          { text: 'Running locally', link: '/how-to/running-locally' },
          { text: 'Code intelligence (Zed)', link: '/how-to/code-intelligence' },
          { text: 'Deploy: start to finish', link: '/how-to/deploy' },
          { text: 'Configure the Yunavero domain', link: '/how-to/configure-yunavero-domain' },
          { text: 'Brand configuration', link: '/reference/brand-configuration' },
          { text: 'Install: local (offline)', link: '/how-to/install-local' },
          { text: 'Install: self-hosted', link: '/how-to/install-selfhost' },
          { text: 'Add a worker machine', link: '/how-to/add-a-worker' },
          { text: 'Operations', link: '/how-to/operations' },
          { text: 'Event-node reliability', link: '/how-to/event-node-reliability' },
          { text: 'Stable LAN TLS', link: '/how-to/lan-tls' },
          { text: 'PostgreSQL disaster recovery', link: '/how-to/postgres-disaster-recovery' },
          { text: 'Sync reconciliation', link: '/how-to/sync-reconciliation' },
          { text: 'Application telemetry', link: '/how-to/observability' },
        ],
      },
      {
        text: 'Reference - modules',
        collapsed: false,
        items: [
          { text: 'Meet', link: '/reference/modules/meet' },
          { text: 'Bracket', link: '/reference/modules/bracket' },
          { text: 'Operations', link: '/reference/modules/operations' },
          { text: 'Display', link: '/reference/modules/display' },
          { text: 'Entries', link: '/reference/modules/entries' },
          { text: 'Settings', link: '/reference/modules/settings' },
        ],
      },
      {
        text: 'Reference - contracts and API',
        collapsed: false,
        items: [
          { text: 'What a module contract is', link: '/reference/contracts/' },
          { text: 'Meet to Operations (Seam A)', link: '/reference/contracts/meet-operations' },
          { text: 'Bracket to Operations (Seam B)', link: '/reference/contracts/bracket-operations' },
          { text: 'Operations to Display (Seam D)', link: '/reference/contracts/operations-display' },
          { text: 'API: overview and route ownership', link: '/reference/api/' },
          { text: 'API: signals', link: '/reference/api/signals' },
          { text: 'API: setup', link: '/reference/api/setup' },
          { text: 'Offline acceptance matrix', link: '/reference/offline-operator-acceptance-matrix' },
          { text: 'Compatibility matrix', link: '/reference/compatibility-matrix' },
          { text: 'Architecture boundary inventory', link: '/reference/long-term-plan-implementation-status#phase-1-boundary-baseline' },
          { text: 'Long-term plan status', link: '/reference/long-term-plan-implementation-status' },
          { text: 'Phase 4 telemetry audit', link: '/reference/phase-4-telemetry-signal-audit' },
          { text: 'Phase 4 proof gaps', link: '/reference/phase-4-observability-gap-report' },
          { text: 'Workspace keys: the four kinds', link: '/reference/workspace-keys' },
        ],
      },
      {
        text: 'Reference - the repository',
        collapsed: false,
        items: [
          { text: 'Repo layout', link: '/reference/repo-layout' },
          { text: 'Design system', link: '/reference/design-system' },
          { text: 'Surface map', link: '/reference/surface-map' },
          { text: 'Glossary', link: '/reference/glossary' },
          { text: 'Debt log', link: '/reference/debt-log' },
          { text: 'Recipes', link: '/examples/' },
          { text: 'Workspace templates', link: '/templates/' },
        ],
      },
      {
        text: 'Explanation - the system',
        collapsed: false,
        items: [
          { text: 'What ShuttleWorks is', link: '/explanation/what-is-shuttleworks' },
          { text: 'User flow', link: '/explanation/user-flow' },
          { text: 'System overview', link: '/explanation/architecture/system-overview' },
          { text: 'Workspace model', link: '/explanation/architecture/workspace-model' },
          { text: 'Entrant tier (the public site)', link: '/explanation/architecture/entrant-tier' },
          { text: 'Data flow', link: '/explanation/architecture/data-flow' },
          { text: 'State management', link: '/explanation/architecture/state-management' },
          { text: 'Backend structure', link: '/explanation/architecture/backend-structure' },
          { text: 'Scheduling unification', link: '/explanation/architecture/scheduling-unification' },
          { text: 'Unified configuration', link: '/explanation/architecture/unified-configuration' },
          { text: 'Bracket schedule streaming', link: '/explanation/architecture/bracket-schedule-streaming' },
          { text: 'Bracket result queue', link: '/explanation/architecture/bracket-result-queue' },
          { text: 'Unified operations view', link: '/explanation/architecture/unified-operations-view' },
          { text: 'Operational scenarios', link: '/explanation/architecture/operational-scenarios' },
          { text: 'Long-term runtime architecture', link: '/explanation/architecture/long-term-runtime' },
          { text: 'Security threat model', link: '/explanation/security-threat-model' },
          { text: 'Bracket draw canvas', link: '/explanation/architecture/bracket-draw-canvas' },
          { text: 'Draw formats', link: '/explanation/architecture/draw-formats' },
          { text: 'Quality attributes', link: '/explanation/architecture/quality-attributes' },
          { text: 'Console naming', link: '/explanation/console-naming' },
        ],
      },
      {
        text: 'Explanation - decisions (ADRs)',
        collapsed: true,
        items: [
          { text: 'ADR log', link: '/explanation/decisions/' },
          { text: '0001 - Four-module split', link: '/explanation/decisions/0001-four-module-split' },
          { text: '0002 - Workspace as control plane', link: '/explanation/decisions/0002-workspace-as-control-plane' },
          { text: '0003 - SQLite as primary persistence', link: '/explanation/decisions/0003-sqlite-as-primary-persistence' },
          { text: '0004 - OR-Tools CP-SAT engine', link: '/explanation/decisions/0004-ortools-cpsat-engine' },
          { text: '0005 - coming_soon elimination', link: '/explanation/decisions/0005-coming-soon-elimination' },
          { text: '0006 - Unified scheduling core', link: '/explanation/decisions/0006-unified-scheduling-core' },
          { text: '0007 - Bracket result command queue', link: '/explanation/decisions/0007-bracket-result-command-queue' },
          { text: '0008 - Shared scoring fields', link: '/explanation/decisions/0008-shared-scoring-fields' },
          { text: '0009 - Universal match contract', link: '/explanation/decisions/0009-universal-match-contract' },
          { text: '0010 - Nav model in platform', link: '/explanation/decisions/0010-nav-model-in-platform' },
          { text: '0011 - Cross-product boundary policy', link: '/explanation/decisions/0011-cross-product-boundary-policy' },
          { text: '0012 - Remove the Supabase mirror', link: '/explanation/decisions/0012-remove-the-supabase-mirror' },
          { text: '0013 - Shared-UI promotion policy', link: '/explanation/decisions/0013-shared-ui-promotion-policy' },
          { text: '0014 - Workspace vs tournament vocabulary', link: '/explanation/decisions/0014-workspace-vs-tournament-vocabulary' },
          { text: '0015 - Court policy', link: '/explanation/decisions/0015-court-policy' },
          { text: '0016 - Demo production parity', link: '/explanation/decisions/0016-demo-production-parity-and-durability' },
          { text: '0017 - Domain-derived Setup readiness', link: '/explanation/decisions/0017-domain-derived-setup-readiness' },
          { text: '0018 - Public person universality', link: '/explanation/decisions/0018-public-person-universality' },
          { text: '0019 - Design-system consolidation pass', link: '/explanation/decisions/0019-design-system-consolidation-pass' },
          { text: '0020 - Design-language resolutions', link: '/explanation/decisions/0020-design-language-resolutions' },
          { text: '0021 - Hybrid persistence and cloud WAL', link: '/explanation/decisions/0021-hybrid-persistence-and-cloud-wal' },
          { text: '0022 - Authority epochs and domain operations', link: '/explanation/decisions/0022-authority-epochs-and-domain-operations' },
          { text: '0023 - Docker-first event node and entrant freeze', link: '/explanation/decisions/0023-docker-first-event-node-and-entrant-freeze' },
          { text: '0024 - Compatibility and release governance', link: '/explanation/decisions/0024-compatibility-and-release-governance' },
        ],
      },
    ],
    search: { provider: 'local' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/wongywrongy/ShuttleWorks' },
    ],

    editLink: {
      pattern: 'https://github.com/wongywrongy/ShuttleWorks/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    // Provenance stamp — which commit this build came from. Run
    // `npm run docs:freshness` to check whether the code has moved on since.
    footer: {
      message: STAMP
        ? `Built from <code>${STAMP.branch}@${STAMP.sha}</code> · ${STAMP.date} — run <code>npm run docs:freshness</code> to check for drift against the code.`
        : `${BRAND.productName} documentation`,
      copyright: `© ${new Date().getUTCFullYear()} ${BRAND.companyName}. ${BRAND.productName} is a ${BRAND.companyName} product.`,
    },
  },
})
