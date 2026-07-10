import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
