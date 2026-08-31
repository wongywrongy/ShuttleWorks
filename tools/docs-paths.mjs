#!/usr/bin/env node
/**
 * docs-paths — check repository-relative paths named by the live docs.
 *
 * VitePress checks links, but inline code and fenced examples commonly name
 * source files without making them links. This check keeps those references
 * honest without reading Git history, so it also runs in the docs image.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// VitePress pages plus the standing guidance and product/package READMEs that
// developers actively consult. Dated program records are intentionally absent.
export const DOC_ROOTS = [
  'README.md',
  'CLAUDE.md',
  'CODE_HEALTH.md',
  'SECURITY.md',
  'apps/api/BACKEND.md',
  'apps/api/README.md',
  'apps/console/FRONTEND.md',
  'apps/console/src/api/README.md',
  'apps/console/src/components/README.md',
  'apps/console/src/hooks/README.md',
  'apps/console/src/lib/README.md',
  'apps/console/src/store/README.md',
  'apps/entrant/PRODUCT.md',
  'apps/entrant/README.md',
  'packages/design-system/BRAND.md',
  'packages/design-system/DESIGN.md',
  'packages/design-system/DESIGN_COLOR.md',
  'packages/design-system/MOTION.md',
  'packages/design-system/icons/README.md',
  'packages/scheduler-core/scheduler_core/README.md',
  'packages/scheduler-core/scheduler_core/engine/README.md',
  'simulator/README.md',
  'tests/e2e/README.md',
  'docs/index.md',
  'docs/tutorials',
  'docs/how-to',
  'docs/reference',
  'docs/explanation',
  'docs/examples',
  'docs/templates',
]

const EXCLUDED = ['docs/.vitepress/']

// Documented build/capture destinations are absent from a clean checkout by
// design. Keep this exact and small: these roots are gitignored outputs, not
// exceptions for missing source files.
const GENERATED_OUTPUTS = ['docs/.vitepress/dist', 'docs/screenshots/ui-review']

const PLACEHOLDER = /[<>{}]/
const URL_PATTERN = /^(?:https?:|mailto:|file:)/i
const TRAILING = /[),.:;!?`*]+$/
const LINE_SUFFIX = /:\d+(?:-\d+)?(?:,\d+)*$/
const SYMBOL_SUFFIX = /::[A-Za-z_$][\w$.-]*$/
const IGNORE_NEXT = /^\s*<!--\s*docs-paths-ignore-next-line:\s*(\S.*?)\s*-->\s*$/

// Include the pre-reorg roots on purpose. A stale path under one of these
// roots is still a repository-relative claim and must be repaired, not added
// to an ignore list.
const ROOTS = [
  'apps',
  'packages',
  'infra',
  'tests',
  'simulator',
  'tools',
  'docs',
  'archive',
  'legacy',
  '.github',
  '.superpowers',
  'backend',
  'frontend',
  'products',
  'scheduler_core',
  'app',
  'api',
  'services',
  'database',
  'src',
]

const ROOT_PATTERN = ROOTS.map((root) => root.replace('.', '\\.')).join('|')
const PATH_TOKEN = new RegExp(
  `(?:^|[\\s("'=:(\\x60])((?:\\.{1,2}/)?(?:${ROOT_PATTERN})/[^\\s"')\\]]+)`,
  'g',
)

function isExcluded(relativePath) {
  return EXCLUDED.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix))
}

function markdownFiles(root = REPO_ROOT) {
  const files = []
  const visit = (relativePath) => {
    if (isExcluded(relativePath)) return
    const absolute = resolve(root, relativePath)
    if (!existsSync(absolute)) throw new Error(`configured documentation root does not exist: ${relativePath}`)
    const info = statSync(absolute)
    if (info.isFile()) {
      if (extname(relativePath) === '.md') files.push(relativePath)
      return
    }
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      visit(`${relativePath}/${entry.name}`)
    }
  }
  for (const rootPath of DOC_ROOTS) visit(rootPath)
  return files.sort()
}

function stripSuffix(raw) {
  let value = raw.replace(TRAILING, '')
  value = value.replace(SYMBOL_SUFFIX, '')
  value = value.replace(LINE_SUFFIX, '')
  return value.replace(TRAILING, '')
}

function isDottedSymbol(value) {
  const basename = value.slice(value.lastIndexOf('/') + 1)
  const dot = basename.indexOf('.')
  return dot > 0 && basename.slice(dot + 1).includes('_')
}

function isGeneratedOutput(path, root) {
  const repoPath = relative(root, path).replaceAll('\\', '/').replace(/\/$/, '')
  return GENERATED_OUTPUTS.some((output) => repoPath === output || repoPath.startsWith(`${output}/`))
}

function candidatePath(raw, documentPath, root) {
  const value = stripSuffix(raw)
  if (!value || URL_PATTERN.test(value) || PLACEHOLDER.test(value) || value.includes('${')) return null
  if (value.includes('…')) return value.slice(0, value.indexOf('…')).replace(/\/$/, '')
  if (value.includes('...')) return value.slice(0, value.indexOf('...')).replace(/\/$/, '')
  if (value.endsWith('/*')) return value.slice(0, -2)
  if (value.startsWith('./') || value.startsWith('../')) return resolve(dirname(resolve(root, documentPath)), value)
  return resolve(root, value)
}

/** Extract and validate path-shaped references from one Markdown document. */
export function checkDocument(content, documentPath, root = REPO_ROOT) {
  if (isExcluded(documentPath)) return []
  const errors = []
  const lines = content.split(/\r?\n/)
  let ignoreNext = false
  lines.forEach((line, index) => {
    const suppression = line.match(IGNORE_NEXT)
    if (suppression) {
      ignoreNext = true
      return
    }
    if (ignoreNext) {
      ignoreNext = false
      return
    }
    const withoutUrls = line.replace(/(?:https?:|mailto:|file:)[^\s`]+/gi, '')
    for (const match of withoutUrls.matchAll(PATH_TOKEN)) {
      const raw = match[1]
      const path = candidatePath(raw, documentPath, root)
      if (!path) continue
      if (isDottedSymbol(stripSuffix(raw))) continue
      if (!existsSync(path) && !isGeneratedOutput(path, root)) {
        errors.push({ file: documentPath, line: index + 1, token: stripSuffix(raw) })
      }
    }
  })
  return errors
}

export function checkDocs(root = REPO_ROOT) {
  const errors = []
  for (const documentPath of markdownFiles(root)) {
    const content = readFileSync(resolve(root, documentPath), 'utf8')
    errors.push(...checkDocument(content, documentPath, root))
  }
  return errors
}

function main() {
  const errors = checkDocs()
  if (!errors.length) {
    console.log('docs:paths — all live repository-relative documentation paths exist')
    return
  }
  console.error(`docs:paths — ${errors.length} missing path reference(s):`)
  for (const error of errors) console.error(`  ${error.file}:${error.line}: ${error.token}`)
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main()
