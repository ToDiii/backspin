import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
  server: {
    // Bind to the loopback IP, not the "localhost" name: Spotify only accepts
    // http redirect URIs on a loopback address, and the app derives its
    // redirect URI from window.location.origin.
    host: '127.0.0.1',
    port: 3000,
  },
})

