/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Versione mostrata nelle Impostazioni: data e ora della compilazione (cambia a ogni pubblicazione).
const appVersion = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    testTimeout: 60_000, // i test del sorteggio provano migliaia di combinazioni
  },
});
