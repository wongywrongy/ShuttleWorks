import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { externalizeScripts } from '../../docs/.vitepress/externalize-scripts.mjs'

test('documentation bootstrap executes from self without changing script order or JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sw-docs-csp-'))
  try {
    await mkdir(join(directory, 'guide'))
    const file = join(directory, 'guide', 'index.html')
    const bootstrap = 'document.documentElement.classList.add("dark")'
    const module = 'window.booted = true'
    const json = '<script type="application/json">{"ok":true}</script>'
    await writeFile(file, `<script id="theme">${bootstrap}</script><script type="module">${module}</script>${json}<script src="/existing.js"></script>`)
    // Negative control: the input contains executable inline script.
    assert.match(await readFile(file, 'utf8'), /<script id="theme">document/)
    await externalizeScripts(directory, '/manual/')
    const output = await readFile(file, 'utf8')
    const scripts = [...output.matchAll(/<script([^>]*) src="\/manual\/(assets\/inline-[a-f0-9]+\.js)"><\/script>/g)]
    assert.equal(scripts.length, 2)
    assert.match(scripts[0][1], /id="theme"/)
    assert.match(scripts[1][1], /type="module"/)
    assert.equal(await readFile(join(directory, scripts[0][2]), 'utf8'), bootstrap)
    assert.equal(await readFile(join(directory, scripts[1][2]), 'utf8'), module)
    assert.ok(output.includes(json))
    assert.ok(output.includes('<script src="/existing.js"></script>'))
    await externalizeScripts(directory, '/manual/')
    assert.equal(await readFile(file, 'utf8'), output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
