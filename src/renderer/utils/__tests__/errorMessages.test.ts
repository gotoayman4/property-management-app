import type { TFunction } from 'i18next'
import { describe, it, expect } from 'vitest'
import ar from '../../locales/ar.json'
import en from '../../locales/en.json'
import { resolveIpcError } from '../errorMessages'

const mockT = ((key: string) => key) as unknown as TFunction

describe('errorMessages & IPC Error Codes', () => {
  it('resolves known error code strings correctly', () => {
    const error = new Error('FAILED_TO_LIST_CONTRACTS')
    const resolved = resolveIpcError(error, mockT)
    expect(resolved).toBe('errors.failedToListContracts')
  })

  it('falls back gracefully on unknown error codes', () => {
    const error = new Error('UNKNOWN_SOME_OTHER_ERROR_CODE')
    const resolved = resolveIpcError(error, mockT)
    expect(resolved).toBe('common.genericError')
  })

  it('handles null/non-error values without throwing', () => {
    expect(typeof resolveIpcError(null, mockT)).toBe('string')
    expect(typeof resolveIpcError(undefined, mockT)).toBe('string')
  })

  it('ensures core error keys exist in both ar.json and en.json', () => {
    expect(ar.common).toBeDefined()
    expect(en.common).toBeDefined()
    expect(ar.common.cancel).toBeDefined()
    expect(en.common.cancel).toBeDefined()
  })
})
