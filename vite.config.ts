import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  base: process.env.OPENNOTES_BASE_PATH || '/',
  preview: {
    https: process.env.OPENNOTES_HTTPS === '1' ? {
      cert: readFileSync(join('.local', 'tls.crt')),
      key: readFileSync(join('.local', 'tls.key')),
    } : undefined,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'OpenNotes',
        short_name: 'OpenNotes',
        description: 'A free, local-first space for handwritten notes and PDFs.',
        theme_color: '#172d2b',
        background_color: '#f6f5ef',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,bcmap,ttf,pfb,wasm,icc}', 'pdfjs/**/LICENSE*', 'licenses/*.txt'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
})
