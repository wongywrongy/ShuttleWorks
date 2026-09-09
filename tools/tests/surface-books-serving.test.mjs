import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const helper = join(process.cwd(), 'tools/serve-surface-books.sh')

function mockFixture(label = 'absent') {
  const root = mkdtempSync(join(tmpdir(), 'surface-books-mock-'))
  const bin = join(root, 'bin')
  const artifacts = join(root, 'artifacts')
  mkdirSync(bin); mkdirSync(artifacts)
  writeFileSync(join(artifacts, 'operator-console-surface-book.pdf'), 'fixture')
  const log = join(root, 'docker.log')
  const docker = join(bin, 'docker')
  writeFileSync(docker, `#!/bin/sh
echo "$*" >> "$MOCK_LOG"
if [ "$1" = container ] && [ "$2" = inspect ]; then
  [ "$MOCK_EXISTING" = yes ]; exit $?
fi
if [ "$1" = inspect ]; then
  [ "$MOCK_LABEL" = managed ] && echo managed || echo other
fi
`)
  chmodSync(docker, 0o755)
  return { root, bin, artifacts, log, label }
}

function runMock(fixture, args, ip = '100.100.100.100') {
  return spawnSync('bash', [helper, ...args], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`, MOCK_LOG: fixture.log,
      MOCK_EXISTING: fixture.label === 'absent' ? 'no' : 'yes', MOCK_LABEL: fixture.label,
      SURFACE_BOOKS_TAILSCALE_IP: ip },
  })
}

test('surface-book helper owns its container and refuses unowned replacement', () => {
  const helper = read('tools/serve-surface-books.sh')
  assert.match(helper, /ownership_label=com\.shuttleworks\.surface-books/)
  assert.match(helper, /ownership_value=managed/)
  assert.match(helper, /require_owned_container\(\)/)
  assert.match(helper, /Refusing to modify unowned container/)
  assert.match(helper, /--label "\$ownership_label=\$ownership_value"/)
  assert.match(helper, /require_owned_container\n    docker rm -f/)
})

test('mocked Docker refuses an unowned replacement and records owned read-only mounts', () => {
  const unowned = mockFixture('other')
  const rejected = runMock(unowned, ['up', unowned.artifacts])
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /Refusing to modify unowned container/)
  assert.doesNotMatch(readFileSync(unowned.log, 'utf8'), /rm -f/)

  const owned = mockFixture('absent')
  const started = runMock(owned, ['up', owned.artifacts])
  assert.equal(started.status, 0, started.stderr)
  const log = readFileSync(owned.log, 'utf8')
  assert.match(log, /--label com\.shuttleworks\.surface-books=managed/)
  assert.match(log, /dst=\/usr\/share\/nginx\/html,readonly/)

  const malformedBind = runMock(mockFixture('absent'), ['url', owned.artifacts], '100.064.1.2')
  assert.notEqual(malformedBind.status, 0)
  assert.match(malformedBind.stderr, /Refusing non-Tailscale IPv4 bind/)
})

test('surface-book helper restricts artifacts, bind address, and port', () => {
  const helper = read('tools/serve-surface-books.sh')
  assert.match(helper, /\|"\$HOME"\|"\$repo_root"\)/)
  assert.match(helper, /operator-console-surface-book\.pdf/)
  assert.match(helper, /public-entrant-surface-book\.pdf/)
  assert.match(helper, /Refusing to serve a broad root directory/)
  assert.match(helper, /Refusing non-Tailscale IPv4 bind/)
  assert.match(helper, /port >= 1 && port <= 65535/)
  assert.match(helper, /--publish "\$tailscale_ip:\$listen_port:8080"/)
})

test('surface-book container exposes only a read-only static root', () => {
  const helper = read('tools/serve-surface-books.sh')
  const nginx = read('tools/surface-books.nginx.conf')
  assert.match(helper, /dst=\/usr\/share\/nginx\/html,readonly/)
  assert.match(helper, /dst=\/etc\/nginx\/conf\.d\/default\.conf,readonly/)
  assert.match(helper, /--restart unless-stopped/)
  assert.match(nginx, /root \/usr\/share\/nginx\/html;/)
  assert.match(nginx, /disable_symlinks on;/)
  assert.match(nginx, /return 404;/)
  assert.match(nginx, /location = \/operator-console-surface-book\.pdf/)
  assert.match(nginx, /location = \/public-entrant-surface-book\.pdf/)
})
