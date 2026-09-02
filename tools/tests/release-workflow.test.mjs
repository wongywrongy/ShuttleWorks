import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('.github/workflows/publish-release.yml', 'utf8')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
const security = readFileSync('.github/workflows/security.yml', 'utf8')
const compose = readFileSync('infra/compose/docker-compose.release.yml', 'utf8')

test('release publication is gated by CI for the exact source revision', () => {
  assert.match(workflow, /tags:\s*\['v\*\.\*\.\*'\]/)
  assert.match(workflow, /for workflow in ci\.yml security\.yml/)
  assert.match(workflow, /--workflow "\$workflow"/)
  assert.match(workflow, /--commit "\$SOURCE_SHA"/)
  assert.match(workflow, /SOURCE_REVISION=\$\{\{ steps\.revision\.outputs\.sha \}\}/)
  assert.match(workflow, /sort_by\(\.databaseId\) \| last/)
  assert.match(workflow, /Latest \$workflow run \$run_id concluded \$conclusion/)
  assert.doesNotMatch(workflow, /select\(\.status == "completed" and \.conclusion == "success"\)/)
  assert.doesNotMatch(workflow, /value=latest/)
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/)
})

test('release refs and image tags are immutable and exact', () => {
  assert.match(workflow, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/)
  assert.match(workflow, /\^\[0-9a-fA-F\]\{40\}\$/)
  assert.match(workflow, /type=semver,pattern=\{\{version\}\}/)
  assert.match(workflow, /type=raw,value=sha-\$\{\{ steps\.revision\.outputs\.sha \}\}/)
  assert.doesNotMatch(workflow, /pattern=\{\{major\}\}/)
  assert.doesNotMatch(workflow, /pattern=\{\{major\}\}\.\{\{minor\}\}/)
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
  assert.match(security, /npm-audit:/)
  assert.match(security, /python-audit:/)
  assert.match(security, /severity:\s*HIGH,CRITICAL/)
  assert.match(security, /limit-severities-for-sarif:\s*true/)
  assert.match(security, /ignore-unfixed:\s*false/)
  assert.match(security, /exit-code:\s*"1"/)
})

test('the CI publication gate uses immutable action references', () => {
  const actionRefs = [...ci.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g)].map((match) => match[1])
  assert.ok(actionRefs.length > 8)
  for (const ref of actionRefs) assert.match(ref, /^[0-9a-f]{40}$/)
})

test('stable aggregate checks cover every CI and security job', () => {
  assert.match(ci, /required-ci:\s*\n\s*name: Required CI/)
  for (const job of ['docs', 'frontend', 'entrant', 'backend', 'compose-lint', 'observability-config', 'console-browser-contracts']) {
    assert.match(ci, new RegExp(`\\n\\s*- ${job}\\n`))
  }
  assert.match(security, /required-security:\s*\n\s*name: Required security/)
  for (const job of ['codeql', 'dependency-review', 'npm-audit', 'python-audit', 'container-scan', 'sbom']) {
    assert.match(security, new RegExp(`\\n\\s*- ${job}\\n`))
  }
})

test('the observability gate runs native rule and Collector validation', () => {
  assert.match(ci, /--entrypoint promtool/)
  assert.match(ci, /check rules \/rules\/prometheus-rules\.yaml/)
  assert.match(ci, /collector-event-node\.yaml collector-cloud\.yaml/)
  assert.match(ci, /validate --config="\/etc\/otel\/\$config"/)
  assert.doesNotMatch(ci, /docker run --rm \+/)
})
