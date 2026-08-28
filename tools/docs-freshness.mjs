#!/usr/bin/env node
/**
 * docs-freshness — tell whether the docs/ site is up to date with the code it
 * documents, using git history.
 *
 * For each "area" below it compares two commits:
 *   - the last commit that touched the area's DOC pages, vs
 *   - the last commit that touched the SOURCE that area documents.
 * If the source is newer than the docs, the area is flagged BEHIND, and the
 * commits that landed in the source since the docs last changed are listed
 * (with --list).
 *
 * This reflects COMMITTED history. Uncommitted local edits to docs are detected
 * and reported separately (so freshly-edited-but-uncommitted docs aren't called
 * "behind"); uncommitted source edits are noted too.
 *
 * Usage:
 *   node tools/docs-freshness.mjs           # summary table
 *   node tools/docs-freshness.mjs --list     # + list the source commits behind
 *   node tools/docs-freshness.mjs --json      # machine-readable output
 *
 * Exit code: 1 if any area is BEHIND, 2 for a stale manifest or Git failure,
 * else 0.
 *
 * To extend: add an entry to AREAS mapping doc paths -> the source paths they
 * document. Keep it honest — that mapping is the whole point.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

export const AREAS = [
  {
    name: 'API reference',
    docs: ['docs/reference/api'],
    src: ['apps/api/src'],
  },
  {
    name: 'Backend structure & data flow',
    docs: ['docs/explanation/architecture/backend-structure.md', 'docs/explanation/architecture/data-flow.md'],
    src: [
      'apps/api/src',
      'packages/scheduler-core/scheduler_core',
    ],
  },
  {
    name: 'Workspace model',
    docs: ['docs/explanation/architecture/workspace-model.md'],
    src: [
      'apps/api/src/db/models.py',
      'apps/api/src/workspaces',
      'apps/console/src/platform/product-shell',
      'apps/console/src/platform/domain',
      'apps/console/src/store/tournamentStore.ts',
    ],
  },
  {
    name: 'State management',
    docs: ['docs/explanation/architecture/state-management.md'],
    src: ['apps/console/src/store', 'apps/console/src/hooks'],
  },
  {
    name: 'Module contracts & overview',
    docs: ['docs/reference/contracts', 'docs/explanation/architecture/system-overview.md'],
    src: [
      'apps/console/src/platform/contracts',
      'apps/console/src/platform/product-shell/workspaceNav.ts',
      'apps/console/src/platform/domain/moduleModel.ts',
    ],
  },
  {
    name: 'Modules',
    docs: ['docs/reference/modules'],
    src: ['apps/console/src/modules'],
  },
  {
    name: 'Extending (how-to guides)',
    docs: ['docs/how-to'],
    src: [
      'apps/console/src/platform/product-shell/types.ts',
      'apps/console/src/platform/product-shell/workspaceNav.ts',
      'apps/console/src/store/uiStore.ts',
      'apps/console/src/platform/contracts/moduleContract.ts',
      'apps/console/src/api/client.ts',
      'apps/api/src/db/models.py',
      'apps/api/src/workspaces/workspace_modules.py',
      'packages/scheduler-core/scheduler_core/engine/constraints',
    ],
  },
  {
    name: 'Engine (ADR 0004)',
    docs: ['docs/explanation/decisions/0004-ortools-cpsat-engine.md'],
    src: ['packages/scheduler-core/scheduler_core'],
  },
  {
    // The public tier is a whole second frontend with its own rules (zero
    // client JS, the page-weight gate, the route table). It had no area here
    // for its first two months, which is exactly how it stayed undocumented.
    name: 'Entrant tier (the public site)',
    docs: ['docs/explanation/architecture/entrant-tier.md'],
    src: ['apps/entrant/app', 'apps/entrant/scripts'],
  },
  {
    name: 'Entries module',
    docs: ['docs/reference/modules/entries.md'],
    src: [
      'apps/api/src/entries',
      'apps/api/src/identity/entrants_routes.py',
      'apps/api/src/workspaces/entries_facts.py',
      'apps/console/src/modules/entries',
    ],
  },
]

const args = new Set(process.argv.slice(2))
const wantList = args.has('--list')
const wantJson = args.has('--json')

function git(argv) {
  try {
    return execFileSync('git', argv, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${argv.join(' ')} failed: ${detail}`)
  }
}

/** Fail before consulting history if the manifest itself is stale. */
export function validateManifest(areas = AREAS, root = REPO_ROOT) {
  const missing = areas.flatMap((area) =>
    [...area.docs, ...area.src]
      .filter((path) => !existsSync(`${root}/${path}`))
      .map((path) => `${area.name}: ${path}`),
  )
  if (missing.length) {
    throw new Error(`configured docs/source path(s) do not exist:\n- ${missing.join('\n- ')}`)
  }
}

/** Last commit (sha/ts/date/subject) touching any of `paths`, or null. */
function lastCommit(paths) {
  const out = git(['log', '-1', '--format=%h%x09%ct%x09%cs%x09%s', '--', ...paths])
  if (!out) return null
  const [sha, ts, date, subject] = out.split('\t')
  return { sha, ts: Number(ts), date, subject }
}

/** Whether `paths` have uncommitted (staged or unstaged) changes. */
function hasUncommitted(paths) {
  return git(['status', '--porcelain', '--', ...paths]).length > 0
}

/** Whether the latest source commit follows the latest docs commit in Git. */
export function sourceIsNewer(docsSha, sourceSha, runGit = git) {
  if (docsSha === sourceSha) return false
  return Number(runGit(['rev-list', '--count', `${docsSha}..${sourceSha}`])) > 0
}

/** Source commits that landed since the docs' last commit. */
function commitsBehind(docsSha, srcPaths) {
  if (!docsSha) return []
  const out = git(['log', '--format=%h%x09%cs%x09%s', `${docsSha}..HEAD`, '--', ...srcPaths])
  return out ? out.split('\n').map((l) => l.split('\t')) : []
}

const STATUS = {
  CURRENT: { label: 'CURRENT', mark: 'OK  ' },
  BEHIND: { label: 'BEHIND', mark: 'BEHIND' },
  NEW: { label: 'NEW (docs not committed)', mark: 'NEW ' },
  EDITED: { label: 'LOCAL EDITS (uncommitted docs)', mark: 'EDIT' },
}

if (IS_MAIN) {
  let results
  try {
    validateManifest()
    results = AREAS.map((area) => {
      const docsCommit = lastCommit(area.docs)
      const srcCommit = lastCommit(area.src)
      if (!srcCommit) {
        throw new Error(`${area.name}: no Git commit found for configured source path(s): ${area.src.join(', ')}`)
      }
      const docsDirty = hasUncommitted(area.docs)
      const srcDirty = hasUncommitted(area.src)

      let status
      let behind = []
      if (!docsCommit) {
        status = STATUS.NEW // docs exist only locally (never committed)
      } else if (docsDirty) {
        status = STATUS.EDITED
      } else if (sourceIsNewer(docsCommit.sha, srcCommit.sha)) {
        status = STATUS.BEHIND
        behind = commitsBehind(docsCommit.sha, area.src)
      } else {
        status = STATUS.CURRENT
      }

      return {
        name: area.name,
        status: status.label,
        mark: status.mark,
        isBehind: status === STATUS.BEHIND,
        docs: docsCommit ? `${docsCommit.sha} ${docsCommit.date}` : '(uncommitted)',
        source: srcCommit ? `${srcCommit.sha} ${srcCommit.date}` : '(none)',
        docsDirty,
        srcDirty,
        behind,
      }
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`\ndocs:freshness configuration error: ${detail}`)
    process.exit(2)
  }

if (wantJson) {
  console.log(JSON.stringify({ results }, null, 2))
  process.exit(results.some((r) => r.isBehind) ? 1 : 0)
}

// --- Pretty table ----------------------------------------------------------
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n)
const W = { mark: 6, name: 30, docs: 22, src: 22 }

console.log('\nDocs freshness — docs/ vs the code they document (committed git history)\n')
console.log(
  `  ${pad('STATUS', W.mark)}  ${pad('AREA', W.name)}  ${pad('DOCS @', W.docs)}  ${pad('SOURCE @', W.src)}`,
)
console.log(`  ${'-'.repeat(W.mark)}  ${'-'.repeat(W.name)}  ${'-'.repeat(W.docs)}  ${'-'.repeat(W.src)}`)
for (const r of results) {
  const srcFlag = r.srcDirty ? ' *' : ''
  console.log(`  ${pad(r.mark, W.mark)}  ${pad(r.name, W.name)}  ${pad(r.docs, W.docs)}  ${pad(r.source + srcFlag, W.src)}`)
}

const behindAreas = results.filter((r) => r.isBehind)
const newAreas = results.filter((r) => r.status.startsWith('NEW'))
const editedAreas = results.filter((r) => r.mark === 'EDIT')

console.log('')
if (results.some((r) => r.srcDirty)) console.log('  * = source has uncommitted local changes (not yet in history)')
if (newAreas.length) {
  console.log(
    `  NEW: ${newAreas.length} area(s) have docs that aren't committed yet — commit docs/ so freshness can track drift.`,
  )
}
if (editedAreas.length) {
  console.log(`  EDIT: ${editedAreas.length} area(s) have uncommitted local doc edits (newer than HEAD).`)
}

if (behindAreas.length === 0) {
  console.log('\n  ✅ Up to date: no documented source is newer than its docs.\n')
  process.exit(0)
}

console.log(`\n  ⚠ BEHIND: ${behindAreas.length} area(s) — source changed after the docs last did:\n`)
for (const r of behindAreas) {
  console.log(`  • ${r.name} — ${r.behind.length} source commit(s) since docs ${r.docs}`)
  if (wantList) {
    for (const [sha, date, subject] of r.behind.slice(0, 20)) {
      console.log(`      ${sha} ${date}  ${subject}`)
    }
    if (r.behind.length > 20) console.log(`      … and ${r.behind.length - 20} more`)
  }
}
if (!wantList) console.log('\n  Re-run with --list to see the commits.')
console.log('')
  process.exit(1)
}
