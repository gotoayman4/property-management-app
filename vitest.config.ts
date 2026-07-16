import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * INTENT: Configure Vitest with two isolated test environments.
 * CONSTRAINT: Main-process tests need Node (native better-sqlite3 binding);
 *             renderer tests need a DOM (jsdom) for @testing-library/react.
 * DECISION: Use Vitest `projects` so each suite runs in its own environment
 *           without leaking native-module loads into jsdom or DOM globals into Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  projects: [
    {
      extends: true,
      test: {
        name: 'node',
        environment: 'node',
        include: ['src/main/**/*.test.ts']
      }
    },
    {
      extends: true,
      plugins: [react()],
      test: {
        name: 'renderer',
        environment: 'jsdom',
        include: ['src/renderer/**/*.test.{ts,tsx}'],
        setupFiles: ['src/renderer/test/setup.ts']
      }
    }
  ]
})
