import { afterAll, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

test('the Tailwind config loads the design-system CommonJS preset and scans its source', async () => {
  // Run Tailwind exactly as the build does — through its own jiti-backed config
  // loader. A bare Node require() of the preset returns {} because the
  // design-system package is "type": "module" while tailwind-preset.js:24 is
  // CommonJS; only Tailwind's loader evaluates it correctly.
  const result = await postcss([tailwindcss({ config: './tailwind.config.js' })]).process(
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
    { from: undefined },
  );

  // `bg-brand` and `shadow-glow` appear ONLY inside the design system's
  // Button.tsx (`variant="brand"`), never in this package's own source. If the
  // preset stopped loading, `shadow-glow` would not exist as a utility at all;
  // if the design-system content glob were dropped, neither class would be
  // emitted. Both are the failure mode CLAUDE.md's tailwind.config.js comment
  // describes: "any class used ONLY inside a shared component silently no-ops."
  expect(result.css).toContain('.bg-brand');
  expect(result.css).toContain('.shadow-glow');
});

test('a design-system primitive renders under SSR with the stylesheet linked', async () => {
  const res = await fetchEntrant('/e/health');
  expect(res.status).toBe(200);

  const body = await res.text();
  expect(body).toMatch(/<link rel="stylesheet" href="[^"]*app\.css[^"]*"\s*\/?>/);
  // Real server-rendered markup from @scheduler/design-system/components.
  // Proves the bundler transpiled the package's .tsx source instead of
  // externalizing it, and that the primitive is SSR-safe (spec §5).
  expect(body).toContain('>design system</button>');
  expect(body).toContain('bg-brand');
  expect(body).toContain('shadow-glow');
});
