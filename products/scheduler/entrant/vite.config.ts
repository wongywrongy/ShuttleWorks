import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  // The design system is published as raw .tsx source (its package.json
  // exports map points at ./components/index.ts), so the SSR bundler has to
  // transpile it rather than hand a bare import to Node. Spec §5.
  ssr: {
    noExternal: ['@scheduler/design-system'],
  },
});
