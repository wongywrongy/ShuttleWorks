import { defineConfig } from 'vitepress'
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
// module contracts, and data flow. Authored 2026-06 against branch
// `dev/workspace-suite`.
//
// `srcDir` is the docs/ directory itself (the default when VitePress is run as
// `vitepress build docs`). `outDir` is docs/.vitepress/dist. The dead-link
// checker is left ON (`ignoreDeadLinks: false`) on purpose — a broken internal
// link should fail `docs:build`, which is our verification gate.
//
// IMPORTANT: docs/ already holds a large legacy tree (design records, audits,
// dated change logs, the historical roadmap). With `srcDir: '.'` VitePress
// would otherwise parse every one of those `.md` files as a page and fail the
// build on their GitHub-style relative links. `srcExclude` keeps them on disk
// (nothing is deleted) but out of the site. Useful prose from them has been
// consolidated into the pages below; the originals remain the design archive.
export default defineConfig({
  title: 'ShuttleWorks',
  description:
    'Architecture, module contracts, and data flow for ShuttleWorks — a CP-SAT tournament scheduling control plane (Meet · Bracket · Operations · Display).',
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

  // Legacy/scratch trees: kept on disk, excluded from the site. These are the
  // design record and historical logs — not part of the curated IA.
  srcExclude: [
    'architectural-roadmap.md',
    'tech-stack.md',
    'audits/**',
    'changes/**',
    'deploy/**',
    'superpowers/**',
    'architecture/workspace-suite/**',
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
    nav: [
      { text: 'Getting started', link: '/getting-started/what-is-shuttleworks' },
      { text: 'Architecture', link: '/architecture/system-overview' },
      { text: 'Modules', link: '/modules/meet' },
      { text: 'Contracts', link: '/contracts/' },
      { text: 'API', link: '/api/' },
      { text: 'Decisions', link: '/decisions/' },
    ],

    sidebar: [
      {
        text: 'Getting started',
        collapsed: false,
        items: [
          { text: 'What ShuttleWorks is', link: '/getting-started/what-is-shuttleworks' },
          { text: 'Running locally', link: '/getting-started/running-locally' },
          { text: 'Repo layout', link: '/getting-started/repo-layout' },
        ],
      },
      {
        text: 'Architecture',
        collapsed: false,
        items: [
          { text: 'System overview', link: '/architecture/system-overview' },
          { text: 'Workspace model', link: '/architecture/workspace-model' },
          { text: 'Data flow', link: '/architecture/data-flow' },
          { text: 'State management', link: '/architecture/state-management' },
          { text: 'Backend structure', link: '/architecture/backend-structure' },
          { text: 'Scheduling unification', link: '/architecture/scheduling-unification' },
        ],
      },
      {
        text: 'Modules',
        collapsed: false,
        items: [
          { text: 'Meet', link: '/modules/meet' },
          { text: 'Bracket', link: '/modules/bracket' },
          { text: 'Operations', link: '/modules/operations' },
          { text: 'Display', link: '/modules/display' },
          { text: 'Settings', link: '/modules/settings' },
        ],
      },
      {
        text: 'Module contracts',
        collapsed: false,
        items: [
          { text: 'What a module contract is', link: '/contracts/' },
          { text: 'Meet → Operations (Seam A)', link: '/contracts/meet-operations' },
          { text: 'Bracket → Operations (Seam B)', link: '/contracts/bracket-operations' },
          { text: 'Operations → Display (Seam D)', link: '/contracts/operations-display' },
        ],
      },
      {
        text: 'API reference',
        collapsed: false,
        items: [
          { text: 'Overview & route ownership', link: '/api/' },
          { text: 'Signals API', link: '/api/signals' },
        ],
      },
      {
        text: 'Decisions',
        collapsed: false,
        items: [
          { text: 'ADR log', link: '/decisions/' },
          { text: '0001 · Four-module split', link: '/decisions/0001-four-module-split' },
          { text: '0002 · Workspace as control plane', link: '/decisions/0002-workspace-as-control-plane' },
          { text: '0003 · SQLite as primary persistence', link: '/decisions/0003-sqlite-as-primary-persistence' },
          { text: '0004 · OR-Tools CP-SAT engine', link: '/decisions/0004-ortools-cpsat-engine' },
          { text: '0005 · coming_soon elimination', link: '/decisions/0005-coming-soon-elimination' },
          { text: '0006 · Unified scheduling core', link: '/decisions/0006-unified-scheduling-core' },
        ],
      },
    ],

    search: { provider: 'local' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/wongywrongy/ShuttleWorks' },
    ],

    editLink: {
      pattern:
        'https://github.com/wongywrongy/ShuttleWorks/edit/dev/workspace-suite/docs/:path',
      text: 'Edit this page on GitHub',
    },

    // Provenance stamp — which commit this build came from. Run
    // `npm run docs:freshness` to check whether the code has moved on since.
    footer: {
      message: STAMP
        ? `Built from <code>${STAMP.branch}@${STAMP.sha}</code> · ${STAMP.date} — run <code>npm run docs:freshness</code> to check for drift against the code.`
        : 'ShuttleWorks documentation',
      copyright: 'ShuttleWorks',
    },
  },
})
