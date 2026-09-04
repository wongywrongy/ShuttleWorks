import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('Yunavero owns a single generated ShuttleWorks brand contract', () => {
  const brand = JSON.parse(read('packages/brand/brand.json'))
  assert.deepEqual(brand, {
    schemaVersion: 1,
    productName: 'ShuttleWorks',
    publicProductName: 'ShuttleWorks Tournaments',
    productMonogram: 'SW',
    companyName: 'Yunavero',
    companyDomain: 'yunavero.com',
    endorsement: 'by Yunavero',
    operatorHostname: 'app.yunavero.com',
    entrantHostname: 'play.yunavero.com',
  })
  assert.notEqual(brand.operatorHostname, brand.entrantHostname)
  assert.match(read('packages/brand/generated.ts'), /companyName: "Yunavero"/)
  assert.match(read('apps/api/src/core/brand.py'), /COMPANY_NAME = "Yunavero"/)
})

test('customer surfaces consume the shared brand while protocol names stay stable', () => {
  assert.match(read('apps/console/src/components/ShuttleWorksMark.tsx'), /BRAND\.productName/)
  assert.match(read('apps/entrant/app/components/PlayShell.tsx'), /BRAND\.endorsement/)
  assert.match(read('apps/api/src/core/main.py'), /PRODUCT_NAME/)
  assert.match(read('apps/api/src/core/main.py'), /BRAND_SIGNATURE/)

  assert.match(read('apps/api/src/core/main.py'), /X-ShuttleWorks-CSRF/)
  assert.match(read('apps/api/src/core/telemetry/bootstrap.py'), /shuttleworks\.sync\.outbox\.depth/)
  assert.match(read('apps/api/src/recovery/bundles.py'), /shuttleworks-event-node-recovery/)
})

test('Yunavero deployment defaults preserve the two-origin security boundary', () => {
  const env = read('infra/compose/.env.selfhost.example')
  const compose = read('infra/compose/docker-compose.selfhost.yml')
  assert.match(env, /^APP_HOSTNAME=app\.yunavero\.com$/m)
  assert.match(env, /^PLAY_HOSTNAME=play\.yunavero\.com$/m)
  assert.match(compose, /CORS_ORIGINS=https:\/\/\$\{APP_HOSTNAME/)
  assert.match(compose, /PUBLIC_PLAY_ORIGIN=https:\/\/\$\{PLAY_HOSTNAME/)
  assert.doesNotMatch(compose, /^\s+- SESSION_COOKIE_DOMAIN=/m)
})

test('every Node production image includes the shared brand workspace', () => {
  for (const dockerfile of [
    'apps/console/Dockerfile',
    'apps/entrant/Dockerfile',
    'docs/Dockerfile',
  ]) {
    const source = read(dockerfile)
    assert.match(source, /COPY packages\/brand\/package\.json/)
    assert.match(source, /COPY packages\/brand \.\/packages\/brand/)
  }
})
