import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('.github/workflows/publish-release.yml', 'utf8')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
const security = readFileSync('.github/workflows/security.yml', 'utf8')
const compose = readFileSync('infra/compose/docker-compose.release.yml', 'utf8')

test('release publication is gated by CI for the exact source revision', () => {
  assert.match(workflow, /tags:\s*\['v\*\.\*\.\*'\]/)
  assert.match(workflow, /--workflow ci\.yml/)
  assert.match(workflow, /--commit "\$SOURCE_SHA"/)
  assert.match(workflow, /SOURCE_REVISION=\$\{\{ steps\.revision\.outputs\.sha \}\}/)
  assert.doesNotMatch(workflow, /value=latest/)
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/)
})

test('release Compose requires an explicit image tag', () => {
  assert.match(compose, /\$\{TAG:\?TAG must be a tested semver release or commit-SHA image tag\}/)
  assert.doesNotMatch(compose, /TAG:-latest/)
})

test('release images carry provenance, SBOMs, and keyless signatures', () => {
  const actionRefs = [...workflow.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g)].map((match) => match[1])
  assert.ok(actionRefs.length >= 7)
  for (const ref of actionRefs) assert.match(ref, /^[0-9a-f]{40}$/)
  assert.match(workflow, /attest-build-provenance@[0-9a-f]{40}/)
  assert.match(workflow, /sbom:\s*true/)
  assert.match(workflow, /provenance:\s*mode=max/)
  assert.match(workflow, /cosign-installer@[0-9a-f]{40}/)
  assert.match(workflow, /cosign sign --yes/)
  assert.match(workflow, /cosign verify/)
  assert.match(workflow, /certificate-oidc-issuer=https:\/\/token\.actions\.githubusercontent\.com/)
  assert.match(workflow, /id-token:\s*write/)
  assert.match(workflow, /attestations:\s*write/)
})

test('security controls use immutable action references and cover all required scans', () => {
  const actionRefs = [...security.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g)].map((match) => match[1])
  assert.ok(actionRefs.length > 8)
  for (const ref of actionRefs) assert.match(ref, /^[0-9a-f]{40}$/)
  assert.match(security, /codeql-action\/init@/)
  assert.match(security, /dependency-review-action@/)
  assert.match(security, /npm audit/)
  assert.match(security, /pip-audit/)
  assert.match(security, /trivy-action@/)
  assert.match(security, /sbom-action@/)
  assert.match(security, /format: spdx-json/)
})

test('the CI publication gate uses immutable action references', () => {
  const actionRefs = [...ci.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g)].map((match) => match[1])
  assert.ok(actionRefs.length > 8)
  for (const ref of actionRefs) assert.match(ref, /^[0-9a-f]{40}$/)
})
