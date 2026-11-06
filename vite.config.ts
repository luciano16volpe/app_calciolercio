/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Versione mostrata nelle Impostazioni: data e ora della compilazione (cambia a ogni pubblicazione).
const appVersion = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Precache only entry scripts and their static dependencies. Feature chunks are cached on demand.
const shellScripts = new Set<string>();
const shellPrecache: Plugin = {
  name: 'shell-precache',
  generateBundle(_options, bundle) {
    shellScripts.clear();
    const collect = (file: string) => {
      const chunk = bundle[file];
      if (!chunk || chunk.type !== 'chunk' || shellScripts.has(file)) return;
      shellScripts.add(file);
      chunk.imports.forEach(collect);
    };
    for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk' && chunk.isEntry) collect(chunk.fileName);
  },
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    shellPrecache,
    VitePWA({
      registerType: 'autoUpdate',
      // il gestore delle notifiche push (public/push-sw.js) viene caricato dal service worker dell'app
      workbox: {
        importScripts: ['push-sw.js'], globPatterns: ['**/*.{js,css,html,woff2}'],
        manifestTransforms: [async (entries) => ({
          manifest: entries.filter(({ url }) => !url.endsWith('.js') || shellScripts.has(url.replace(/^\/+/, '')) || url === 'registerSW.js' || url === 'push-sw.js'),
          warnings: [],
        })],
        runtimeCaching: [{
          urlPattern: /\/assets\/[^/]+\.js$/,
          handler: 'CacheFirst',
          options: { cacheName: 'calciolercio-feature-code', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 } },
        }],
      },
      includeAssets: ['apple-touch-icon.png', 'icon-64.png'],
      manifest: {
        name: 'CalcioLercio',
        short_name: 'CalcioLercio',
        lang: 'it',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a4a8f',
        theme_color: '#1a4a8f',
        icons: [
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    testTimeout: 60_000, // i test del sorteggio provano migliaia di combinazioni
  },
});
