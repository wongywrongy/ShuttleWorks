import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import brand from '../../packages/brand/brand.json'

// The fixture runner exports the same server-side variables used by the API.
// Translate them at build time for this static tier, but never bake a demo
// instant into a non-local build.
const buildEnvironment = (process.env.VITE_ENVIRONMENT ?? process.env.ENVIRONMENT ?? 'production').trim().toLowerCase();
const buildDemoNow = buildEnvironment === 'local'
  ? (process.env.VITE_DEMO_NOW ?? process.env.SHUTTLEWORKS_DEMO_NOW ?? '')
  : '';

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_ENVIRONMENT': JSON.stringify(buildEnvironment),
    'import.meta.env.VITE_DEMO_NOW': JSON.stringify(buildDemoNow),
  },
  plugins: [
    {
      name: 'brand-html',
      transformIndexHtml: (html) => html.replaceAll('__PRODUCT_NAME__', brand.productName),
    },
    react(),
    // Bundle analysis — opt-in via ANALYZE=1 npm run build (perf diagnosis only).
    process.env.ANALYZE
      ? visualizer({ filename: 'dist/stats.html', template: 'treemap', gzipSize: true })
      : null,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // Pre-transform the lazily-loaded module entrypoints (ModuleOutlet.tsx)
    // + Meet's own lazy sub-pages (MeetProduct.tsx) so the FIRST tab click
    // in dev doesn't pay cold esbuild-transform cost. Perf pass 2 (dev-UX).
    warmup: {
      clientFiles: [
        './src/modules/meet/MeetProduct.tsx',
        './src/modules/meet/TournamentSetupPage.tsx',
        './src/modules/meet/roster/RosterTab.tsx',
        './src/modules/meet/matches/MatchesTab.tsx',
        './src/modules/meet/SchedulePage.tsx',
        './src/modules/meet/MatchControlCenterPage.tsx',
        './src/modules/bracket/BracketProduct.tsx',
        './src/modules/bracket/BracketTab.tsx',
        './src/modules/operations/OperationsProduct.tsx',
        './src/modules/display/DisplayProduct.tsx',
        './src/modules/display/PublicDisplayPage.tsx',
      ],
    },
  },
  build: {
    // Code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-select', '@headlessui/react', '@phosphor-icons/react'],
          'utils': ['axios', 'zustand', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // Increase chunk size warning limit (some chunks will be larger due to dependencies)
    chunkSizeWarningLimit: 600,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Minification settings
    minify: 'esbuild',
    target: 'es2020',
  },
})
