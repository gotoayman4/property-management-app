/**
 * @file logger — centralized main-process logger backed by electron-log.
 *
 * INTENT: Replace the scattered `console.error` / `console.warn` calls across src/main with a
 *         single configured logger so production builds persist structured logs to
 *         `userData/logs/main.log` instead of leaking full error objects (with stack traces) to
 *         stdout/stderr — where they're unobserved and contradict the project's own no-prod-logging
 *         rule (documented at authIpc.ts:8).
 *
 * CONSTRAINTS:
 *   - AGENTS.md: no `console.log` in production code. This module is the sanctioned escape hatch.
 *   - electron-log@5.4.4: file transport to userData/logs by default; console transport mirrors in dev.
 *   - Test environment: when Electron's `app` is unavailable (vitest mocks electron), electron-log
 *     falls back to console-only logging — no crash, no file writes. This is the documented behavior.
 *
 * DECISION: Export a pre-configured singleton `log` (the electron-log instance) plus convenience
 *           `logger.error` / `logger.warn` / `logger.info` wrappers. The wrappers accept a context
 *           label and an error/unknown payload, normalizing both into a single structured line so
 *           log entries stay greppable and stack traces are preserved in the file, not stdout.
 */

import log from 'electron-log'

/**
 * Configure transports once at module load.
 * - File transport: writes to `<userData>/logs/main.log` (rotated by electron-log).
 * - Console transport: enabled in dev for live feedback, suppressed in packaged builds to honor
 *   the no-stdout-leak rule.
 *
 * CAVEAT: `app.isPackaged` is read lazily inside electron-log's own initialization when `app` is
 *         available. We additionally gate the console transport on NODE_ENV so unit tests (where
 *         `app` is mocked) don't emit noisy console output unless explicitly enabled.
 */
const isProduction = process.env.NODE_ENV === 'production'
log.transports.file.level = isProduction ? 'info' : 'debug'
log.transports.console.level = isProduction ? false : 'debug'

// Single-line, ISO-prefixed, machine-parseable format.
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

/**
 * Log an error with an optional context label. Accepts an Error (stack preserved), a string, or
 * any unknown payload. The IPC layer's machine-readable codes (INVALID_INPUT, FAILED_TO_*, …)
 * are passed through as the message so log entries stay correlated with renderer-facing errors.
 *
 * @example
 *   logger.error('backupIpc', error)              // Error object
 *   logger.error('ledgerIpc', 'LEDGER_ZERO_AMOUNT') // machine-readable code
 */
export const logger = {
  error(context: string, error: unknown): void {
    if (error instanceof Error) {
      log.error(`[${context}]`, error.message, error.stack ?? '')
    } else {
      log.error(`[${context}]`, typeof error === 'string' ? error : JSON.stringify(error))
    }
  },
  warn(context: string, message: string, details?: unknown): void {
    if (details !== undefined) {
      log.warn(`[${context}]`, message, details instanceof Error ? details.message : details)
    } else {
      log.warn(`[${context}]`, message)
    }
  },
  info(context: string, message: string, details?: unknown): void {
    if (details !== undefined) {
      log.info(`[${context}]`, message, details)
    } else {
      log.info(`[${context}]`, message)
    }
  }
}

export { log }
export default log
