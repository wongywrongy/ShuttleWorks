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
 *   node scripts/docs-freshness.mjs           # summary table
 *   node scripts/docs-freshness.mjs --list     # + list the source commits behind
 *   node scripts/docs-freshness.mjs --json      # machine-readable output
 *
 * Exit code: 1 if any area is BEHIND (so CI can gate), else 0.
 *
 * To extend: add an entry to AREAS mapping doc paths -> the source paths they
 * document. Keep it honest — that mapping is the whole point.
 */
import { execFileSync } from 'node:child_process'

const AREAS = [
  {
    name: 'API reference',
    docs: ['docs/api'],
    src: ['products/scheduler/backend/api', 'products/scheduler/backend/app/schemas.py'],
  },
  {
    name: 'Backend structure & data flow',
    docs: ['docs/architecture/backend-structure.md', 'docs/architecture/data-flow.md'],
    src: [
      'products/scheduler/backend/database',
      'products/scheduler/backend/repositories',
      'products/scheduler/backend/services',
      'products/scheduler/backend/alembic',
    ],
  },
  {
    name: 'Workspace model',
    docs: ['docs/architecture/workspace-model.md'],
    src: [
      'products/scheduler/backend/api/workspace_modules.py',
      'products/scheduler/backend/api/workspace_signals.py',
      'products/scheduler/backend/database/models.py',
    ],
  },
  {
    name: 'State management',
    docs: ['docs/architecture/state-management.md'],
    src: ['products/scheduler/frontend/src/store', 'products/scheduler/frontend/src/hooks'],
  },
  {
    name: 'Module contracts & overview',
    docs: ['docs/contracts', 'docs/architecture/system-overview.md'],
    src: [
      'products/scheduler/frontend/src/platform/contracts',
      'products/scheduler/frontend/src/app/workspace/workspaceNav.ts',
    ],
  },
  {
    name: 'Modules',
    docs: ['docs/modules'],
    src: ['products/scheduler/frontend/src/products'],
  },
  {
    name: 'Extending (how-to guides)',
    docs: ['docs/how-to'],
    src: [
      'products/scheduler/frontend/src/platform/product-shell/types.ts',
      'products/scheduler/frontend/src/app/workspace/workspaceNav.ts',
      'products/scheduler/frontend/src/store/uiStore.ts',
      'products/scheduler/frontend/src/platform/contracts/moduleContract.ts',
      'products/scheduler/frontend/src/api/client.ts',
      'products/scheduler/backend/database/models.py',
      'products/scheduler/backend/api/workspace_modules.py',
      'scheduler_core/engine/constraints',
    ],
  },
  {
    name: 'Engine (ADR 0004)',
    docs: ['docs/decisions/0004-ortools-cpsat-engine.md'],
    src: ['scheduler_core'],
  },
]

const args = new Set(process.argv.slice(2))
const wantList = args.has('--list')
const wantJson = args.has('--json')

function git(argv) {
  try {
    return execFileSync('git', argv, { encoding: 'utf8' }).trim()
  } catch {
    return ''
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

const results = AREAS.map((area) => {
  const docsCommit = lastCommit(area.docs)
  const srcCommit = lastCommit(area.src)
  const docsDirty = hasUncommitted(area.docs)
  const srcDirty = hasUncommitted(area.src)

  let status
  let behind = []
  if (!docsCommit) {
    status = STATUS.NEW // docs exist only locally (never committed) or path empty
  } else if (srcCommit && srcCommit.ts > docsCommit.ts) {
    status = STATUS.BEHIND
    behind = commitsBehind(docsCommit.sha, area.src)
  } else if (docsDirty) {
    status = STATUS.EDITED
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
