import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * INTENT: Configure Vitest with two isolated test environments.
 * CONSTRAINT: Main-process tests need Node (native better-sqlite3 binding);
 *             renderer tests need a DOM (jsdom) for @testing-library/react.
 * DECISION: Use Vitest `projects` so each suite runs in its own environment
 *           without leaking native-module loads into jsdom or DOM globals into Node.
 */
export default defineConfig({
  // Exclude Playwright E2E specs and config from Vitest discovery — they use
  // @playwright/test, not vitest, and must not be collected here.
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', 'e2e/**', 'playwright.config.ts']
  },
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
        // Forks pool in a SINGLE fork so every test file runs sequentially in one process.
        // Native modules (better-sqlite3) are not safe under the threads pool (worker deadlocks)
        // nor under parallel forks (CPU/contention hangs); a single sequential fork loads them
        // once and avoids both.
        // CONSTRAINT: This project MUST NOT load the `bcrypt` native addon. bcrypt and
        // better-sqlite3 deadlock when loaded in the same process/event loop, which hangs the
        // whole suite. The bcrypt-using test file (authIpc.test.ts) is split into the separate
        // `node-auth` project below so the two native modules never share a process.
        pool: 'forks',
        poolOptions: {
          forks: {
            singleFork: true
          }
        },
        environment: 'node',
        include: ['src/main/**/*.test.ts'],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/out/**',
          '**/src/main/ipc/__tests__/authIpc.test.ts'
        ]
      }
    },
    {
      extends: true,
      test: {
        name: 'node-auth',
        // Isolated project for the only test file that loads `bcrypt`. Kept separate from the
        // `node` project so better-sqlite3 and bcrypt never co-exist in one fork process
        // (native-module deadlock). Single fork is still used because this file's tests already
        // pass in isolation and it avoids any parallel bcrypt contention.
        pool: 'forks',
        poolOptions: {
          forks: {
            singleFork: true
          }
        },
        environment: 'node',
        include: ['src/main/ipc/__tests__/authIpc.test.ts']
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
