import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('demo launcher remains recovery-first', () => {
  const launcher = read('tools/demo-compose.sh')

  for (const required of [
    'pg_dump -U scheduler',
    'pg_dumpall -U scheduler --globals-only',
    'sha256sum -c SHA256SUMS',
    'pg_restore -U scheduler',
    'DEMO_RESTORE_CONFIRM=restore-demo',
    'DEMO_RESET_CONFIRM=reset-demo',
    'DEMO_LEGACY_CONFIRM=adopt-legacy-demo',
    'flock -w 300 9',
    'chmod 0700 "$demo_state_dir"',
    'chmod 0640 "$database_url_file"',
  ]) {
    assert.match(launcher, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(launcher, /restore_drill "\$target"\n    if \[\[ -e "\$postgres_marker" \]\]; then\n      create_postgres_backup/)
  assert.match(launcher, /rebuild\)\n    backup_if_present/)
  assert.match(launcher, /down\)\n    backup_if_present/)
  assert.match(launcher, /verify_backup_files "\$tmp"/)
  assert.match(launcher, /needs_tailnet=false/)
  assert.match(launcher, /database_schema_is_current/)
  assert.match(launcher, /restore-in-progress\.env/)
  assert.match(launcher, /Restore refused: an earlier recovery marker still exists/)
  assert.match(launcher, /default_state_dir="\$state_home\/shuttleworks\/demo"/)
  assert.doesNotMatch(launcher, /default_state_dir="\$repo_root/)
})

test('demo uses the production Postgres major and cannot inherit SQLite', () => {
  const demo = read('infra/compose/demo.override.yml')
  const selfhost = read('infra/compose/docker-compose.selfhost.yml')
  const postgresBlock = demo.slice(demo.indexOf('  postgres:'), demo.indexOf('\n  backend:'))
  const backendBlock = demo.slice(demo.indexOf('  backend:'), demo.indexOf('\n  frontend:'))
  const docsBlock = demo.slice(demo.indexOf('  docs:'))

  assert.match(selfhost, /image: postgres:16-alpine/)
  assert.match(postgresBlock, /image: postgres:16-alpine/)
  assert.doesNotMatch(postgresBlock, /\n    ports:/)
  assert.match(backendBlock, /environment: !override/)
  assert.match(backendBlock, /env_file: !reset \[\]/)
  assert.match(backendBlock, /DATABASE_URL_FILE: \/run\/secrets\/demo_database_url/)
  assert.doesNotMatch(backendBlock, /^\s+DATABASE_URL:/m)
  assert.doesNotMatch(backendBlock, /sqlite:|local\.db/i)
  assert.match(docsBlock, /ports: !reset \[\]/)
  assert.doesNotMatch(demo, /\n    build:/)
})

test('destructive seed cleanup is preceded by a database backup', () => {
  const makefile = read('Makefile')
  assert.match(makefile, /^demo-seed-reset: demo-backup$/m)
  assert.match(makefile, /^demo-down:\n\t\$\(DEMO_COMPOSE\) down$/m)
  assert.match(makefile, /^demo-restore-drill:/m)
})
