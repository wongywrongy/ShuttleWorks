import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkDocument, checkDocs } from '../docs-paths.mjs'
import { sourceIsNewer, validateManifest } from '../docs-freshness.mjs'

test('accepts existing paths, punctuation, and line/symbol suffixes', () => {
  const errors = checkDocument(
    '`apps/api/src/core/schemas.py:12::TournamentOut`\n`apps/console/src/modules/`\n`apps/api/src/core/schemas.py:12,18`\n`apps/api/src/db/models.py`:',
    'docs/reference/example.md',
  )
  assert.deepEqual(errors, [])
})

test('reports a missing repository-relative path with its source line', () => {
  const errors = checkDocument('See `apps/api/src/no-longer-here.py`.', 'docs/reference/example.md')
  assert.deepEqual(errors, [
    { file: 'docs/reference/example.md', line: 1, token: 'apps/api/src/no-longer-here.py' },
  ])
})

test('recognizes the retired top-level app root as a repository path', () => {
  const errors = checkDocument('See `app/removed.py`.', 'docs/reference/example.md')
  assert.deepEqual(errors, [
    { file: 'docs/reference/example.md', line: 1, token: 'app/removed.py' },
  ])
})

test('skips URLs, routes, placeholders, and non-filesystem command words', () => {
  const errors = checkDocument(
    [
      'https://example.test/apps/not-a-repository-path',
      '`/tournaments/{id}/state`',
      '`apps/api/src/<domain>/<feature>_routes.py`',
      '`apps/api/src/...`',
      '```sh\nnpm --prefix apps/entrant run test\n```',
      '`services/auth.ensure_personal_org`',
    ].join('\n'),
    'docs/reference/example.md',
  )
  assert.deepEqual(errors, [])
})

test('checks repository paths used as shell-command arguments', () => {
  const errors = checkDocument(
    'npm run test -- apps/no-longer-here/example.test.ts',
    'docs/reference/example.md',
  )
  assert.deepEqual(errors, [
    {
      file: 'docs/reference/example.md',
      line: 1,
      token: 'apps/no-longer-here/example.test.ts',
    },
  ])
})

test('supports one narrowly explained next-line suppression', () => {
  const errors = checkDocument(
    [
      '<!-- docs-paths-ignore-next-line: documents the retired path pattern itself -->',
      '`backend/retired/example.py`',
      '`backend/still-missing.py`',
    ].join('\n'),
    'docs/reference/example.md',
  )
  assert.deepEqual(errors, [
    { file: 'docs/reference/example.md', line: 3, token: 'backend/still-missing.py' },
  ])
})

test('fails closed when a freshness manifest root is missing', () => {
  assert.throws(
    () =>
      validateManifest([
        { name: 'fixture', docs: ['docs'], src: ['apps/does-not-exist'] },
      ]),
    /fixture: apps\/does-not-exist/,
  )
})

test('accepts the checked-in freshness manifest', () => {
  assert.doesNotThrow(() => validateManifest())
})

test('freshness ordering uses Git ancestry, not second-resolution timestamps', () => {
  const calls = []
  const runGit = (args) => {
    calls.push(args)
    return '1'
  }

  assert.equal(sourceIsNewer('docs-sha', 'source-sha', runGit), true)
  assert.deepEqual(calls, [['rev-list', '--count', 'docs-sha..source-sha']])
  assert.equal(sourceIsNewer('same-sha', 'same-sha', runGit), false)
})

test('fails closed when configured live documentation is missing', () => {
  assert.throws(() => checkDocs('/tmp'), /configured documentation root does not exist: README\.md/)
})
