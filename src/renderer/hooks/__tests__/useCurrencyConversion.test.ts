/**
 * @file useCurrencyConversion.test — tests for the display-only currency conversion hook.
 *
 * INTENT: Verify debounced IPC call for exchange rate lookup, identity conversion shortcut,
 *         graceful fallback when no rate exists, and cleanup on unmount.
 * CONSTRAINT: Uses renderHook from @testing-library/react; window.api is mocked.
 *             Fake timers + act() + advanceTimersByTimeAsync to resolve async debounce
 *             and flush React state updates in one step.
 */
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCurrencyConversion } from '../useCurrencyConversion'

const mockLatest = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  ;(
    globalThis as unknown as { window: { api: { exchangeRates: { latest: typeof mockLatest } } } }
  ).window = {
    api: {
      exchangeRates: {
        latest: mockLatest
      }
    }
  }
  mockLatest.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCurrencyConversion', () => {
  it('returns identity conversion when source equals target currency', async () => {
    const { result } = renderHook(() => useCurrencyConversion(500, 'JOD', 'JOD'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current).toHaveLength(1)
    expect(result.current[0].convertedAmount).toBe(500)
    expect(result.current[0].currency).toBe('JOD')
    // Should not call IPC for identity conversion.
    expect(mockLatest).not.toHaveBeenCalled()
  })

  it('returns null convertedAmount for zero amount', () => {
    const { result } = renderHook(() => useCurrencyConversion(0, 'JOD', 'USD'))

    expect(result.current[0].convertedAmount).toBeNull()
    expect(mockLatest).not.toHaveBeenCalled()
  })

  it('returns null convertedAmount for negative amount', () => {
    const { result } = renderHook(() => useCurrencyConversion(-100, 'JOD', 'USD'))

    expect(result.current[0].convertedAmount).toBeNull()
  })

  it('debounces the IPC call by 300ms', async () => {
    mockLatest.mockResolvedValue({ rate: 1.41, effective_date: '2026-07-01' })

    renderHook(() => useCurrencyConversion(100, 'JOD', 'USD'))

    // Before 300ms — no call yet.
    expect(mockLatest).not.toHaveBeenCalled()

    // Advance past debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(mockLatest).toHaveBeenCalledWith({
      currency_from: 'JOD',
      currency_to: 'USD'
    })
  })

  it('multiplies amount by the returned rate', async () => {
    mockLatest.mockResolvedValue({ rate: 1.41, effective_date: '2026-07-01' })

    const { result } = renderHook(() => useCurrencyConversion(100, 'JOD', 'USD'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current[0].convertedAmount).toBeCloseTo(141)
    expect(result.current[0].rateDate).toBe('2026-07-01')
  })

  it('returns null when no rate is available', async () => {
    mockLatest.mockResolvedValue(null)

    const { result } = renderHook(() => useCurrencyConversion(100, 'JOD', 'XYZ'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current[0].convertedAmount).toBeNull()
  })

  it('returns null when rate is zero', async () => {
    mockLatest.mockResolvedValue({ rate: 0, effective_date: '2026-07-01' })

    const { result } = renderHook(() => useCurrencyConversion(100, 'JOD', 'USD'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current[0].convertedAmount).toBeNull()
  })

  it('handles IPC errors gracefully', async () => {
    mockLatest.mockRejectedValue(new Error('IPC failed'))

    const { result } = renderHook(() => useCurrencyConversion(100, 'JOD', 'USD'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(result.current[0].convertedAmount).toBeNull()
  })

  it('uses default target currency when none provided', async () => {
    mockLatest.mockResolvedValue({ rate: 1.0, effective_date: '2026-07-01' })

    renderHook(() => useCurrencyConversion(100, 'JOD'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(mockLatest).toHaveBeenCalledWith({
      currency_from: 'JOD',
      currency_to: 'USD' // default target
    })
  })

  it('cancels the timer on unmount', async () => {
    mockLatest.mockResolvedValue({ rate: 1.41, effective_date: '2026-07-01' })

    const { unmount } = renderHook(() => useCurrencyConversion(100, 'JOD', 'USD'))

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    // Timer was cleaned up — no IPC call should have been made.
    expect(mockLatest).not.toHaveBeenCalled()
  })
})
