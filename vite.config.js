import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'G-MedHub',
        short_name: 'G-MedHub',
        description: 'Hospital Management System',
        theme_color: '#00010D',
        background_color: '#00010D',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // The main JS bundle for this app is ~2.1 MB because we ship a
        // full hospital management system (Pharmacy, Billing, Lab, IPD,
        // Nursing, Inventory, AI Diagnostics, etc.) in one bundle.
        // Workbox's default precache limit is 2 MiB — bumping it to
        // 5 MiB so the bundle precaches without failing the build.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co') && url.pathname.includes('/rest/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-data-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Raise the warning threshold so Vite doesn't complain about
    // the ~2 MB bundle. We're aware of it; splitting it would mean
    // lazy-loading routes which is a bigger refactor.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Split large vendor deps into their own chunks so the main
        // app bundle stays smaller and individual chunks can precache.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'charts-vendor': ['recharts'],
          'sheets-vendor': ['xlsx'],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
})
