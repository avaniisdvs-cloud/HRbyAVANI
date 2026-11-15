import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Playwright owns tests/e2e/** — Vitest must not import those files
    // (different test runtime; @playwright/test fails fast in vitest).
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      include: ['modules/**/*.ts', 'lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/types.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` is provided by Next.js at build time, not installed as a
      // node_module — stub it so server-guarded modules are unit-testable.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
})
