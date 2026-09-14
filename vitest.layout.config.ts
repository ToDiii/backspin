import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/**
 * Separate config for the browser based layout suite in tests/.
 * It needs a Chromium binary and a built dist/, so it stays out of `npm test`
 * and runs as its own step (`npm run test:layout`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    hookTimeout: 240000,
    testTimeout: 30000
  }
})
