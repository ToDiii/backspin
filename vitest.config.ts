import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  // Needed so tests can mount .vue single file components
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/__tests__/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**/*.ts', 'src/stores/**/*.ts']
    }
  }
})
