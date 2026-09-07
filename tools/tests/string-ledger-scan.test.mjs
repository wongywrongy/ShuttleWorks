import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const SCAN_TOOL = path.join(REPO, 'tools/string-ledger-scan.mjs')
const SCAN_OUTPUT = path.join(REPO, 'docs/audits/v3-consolidated/ledger/scan.json')

test('string-ledger-scan runs clean and writes scan.json', () => {
  const stdout = execFileSync(process.execPath, [SCAN_TOOL], { cwd: REPO, encoding: 'utf8' })
  assert.match(stdout, /string-ledger-scan: wrote \d+ deduped candidate strings/)
  assert.ok(existsSync(SCAN_OUTPUT), 'scan.json was not written')
})

test('scan.json has the documented shape and a plausible yield', () => {
  const data = JSON.parse(readFileSync(SCAN_OUTPUT, 'utf8'))
  assert.ok(Array.isArray(data.entries))
  assert.ok(data.totalKeys === data.entries.length)
  assert.ok(data.totalKeys > 500, `expected a substantial yield across both tiers, got ${data.totalKeys}`)
  assert.ok(Array.isArray(data.exclusions) && data.exclusions.length > 0)
  assert.ok(Array.isArray(data.roots) && data.roots.some((r) => r.includes('apps/console/src')))
  assert.ok(data.roots.some((r) => r.includes('apps/entrant/app')))

  for (const key of ['key', 'file', 'line', 'text', 'kind']) {
    assert.ok(key in data.entries[0], `entry missing "${key}"`)
  }
})

test('scan.json excludes class-name and code-token noise', () => {
  const data = JSON.parse(readFileSync(SCAN_OUTPUT, 'utf8'))
  const texts = data.entries.map((e) => e.text)
  assert.ok(!texts.some((t) => /^[a-z0-9-]+$/.test(t) && t.includes('-') && t.length < 40 && /^(text|bg|border|flex|grid|h|w|px|py|gap)-/.test(t)),
    'a Tailwind-class-shaped string leaked into the ledger scan')
  assert.ok(!texts.includes('MODULE_HAS_DATA'), 'a SCREAMING_SNAKE enum code leaked into the ledger scan')
})

test('scan.json entries only come from the two declared tiers, never test files', () => {
  const data = JSON.parse(readFileSync(SCAN_OUTPUT, 'utf8'))
  for (const e of data.entries) {
    assert.ok(
      e.file.startsWith('apps/console/src/') || e.file.startsWith('apps/entrant/app/') || e.file.startsWith('apps/entrant/public/assets/'),
      `entry from outside the declared scan roots: ${e.file}`,
    )
    assert.doesNotMatch(e.file, /\.test\.[jt]sx?$/)
    assert.doesNotMatch(e.file, /\/(__tests__|tests)\//)
  }
})
