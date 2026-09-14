import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Keep VitePress's authored bootstrap scripts compatible with script-src self. */
export async function externalizeScripts(outDir, base = '/') {
  const assets = join(outDir, 'assets')
  await mkdir(assets, { recursive: true })
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (path !== assets) await walk(path)
      } else if (entry.name.endsWith('.html')) {
        const html = await readFile(path, 'utf8')
        const scripts = []
        const transformed = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, body) => {
          if (/\bsrc\s*=/i.test(attrs) || !body.trim()) return tag
          const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]
          if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) return tag
          const hash = createHash('sha256').update(body).digest('hex')
          const name = `inline-${hash}.js`
          scripts.push(writeFile(join(assets, name), body))
          return `<script${attrs} src="${base}assets/${name}"></script>`
        })
        await Promise.all(scripts)
        if (transformed !== html) await writeFile(path, transformed)
      }
    }
  }
  await walk(outDir)
}
