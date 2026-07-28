/**
 * @file UpdateNotifier.test — RTL render tests for the VS Code-style update notifications.
 *
 * INTENT: Verify the IDE-style notification behavior: a 'ready' state prompts a persistent
 *         restart snack, an 'update-available' state prompts a download snack only after the
 *         debounce grace period, the prompt is cancelled when auto-download supersedes it,
 *         and each milestone notifies at most once per version per session.
 * CONSTRAINT: window.api.updates is mocked — no real IPC. Fake timers drive the
 *             AVAILABLE_NOTIFY_DELAY_MS debounce and MUI transition timers deterministically.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UpdateState } from '../../../preload/index.d'
import UpdateNotifier from '../UpdateNotifier'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

const mockGetState = vi.fn()
const mockOnState = vi.fn()
const mockDownload = vi.fn()
const mockInstall = vi.fn()

/** Listener captured from onState so tests can push live state changes. */
let pushState: ((state: UpdateState) => void) | null = null

interface MockWindow {
  api: {
    updates: {
      getState: typeof mockGetState
      onState: typeof mockOnState
      download: typeof mockDownload
      install: typeof mockInstall
    }
  }
}

/** Build an updater state snapshot for a given phase (same shape main broadcasts). */
function makeState(phase: UpdateState['phase'], version = '9.9.9'): UpdateState {
  return {
    phase,
    info:
      phase === 'update-available' || phase === 'downloading' || phase === 'ready'
        ? {
            version,
            releaseName: `v${version}`,
            releaseNotes: '',
            publishedAt: '2026-07-01T00:00:00Z',
            setupUrl: 'https://example.test/setup.exe',
            setupName: `PropManager-${version}-setup.exe`,
            setupSize: 1000,
            shaSumsUrl: 'https://example.test/SHA256SUMS.txt'
          }
        : null,
    progress: 0,
    errorCode: null,
    downloadedPath: null
  }
}

/** Render the notifier with an initial snapshot and flush the getState promise. */
async function renderNotifier(initial: UpdateState): Promise<void> {
  mockGetState.mockResolvedValue(initial)
  render(<UpdateNotifier />)
  await act(async () => {})
}

/** Push a live state change through the captured onState listener. */
function push(state: UpdateState): void {
  act(() => {
    pushState?.(state)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockGetState.mockReset()
  mockOnState.mockReset()
  mockDownload.mockReset()
  mockInstall.mockReset()
  mockDownload.mockResolvedValue(undefined)
  mockInstall.mockResolvedValue(undefined)
  pushState = null
  mockOnState.mockImplementation((listener: (state: UpdateState) => void) => {
    pushState = listener
    return () => {
      pushState = null
    }
  })
  // Extend the existing jsdom window instead of replacing it (Snackbar needs window listeners)
  const w = window as unknown as MockWindow
  w.api = {
    updates: {
      getState: mockGetState,
      onState: mockOnState,
      download: mockDownload,
      install: mockInstall
    }
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  // Remove the api mock so it doesn't leak into other test files
  ;(window as unknown as { api?: MockWindow['api'] }).api = undefined
})

describe('UpdateNotifier', () => {
  it('prompts to restart when the startup snapshot is already ready', async () => {
    await renderNotifier(makeState('ready'))
    expect(screen.getByText('about.updateReadyToast')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'about.restart' }))
    expect(mockInstall).toHaveBeenCalledTimes(1)
  })

  it('announces an available update only after the debounce grace period', async () => {
    await renderNotifier(makeState('idle'))
    push(makeState('update-available'))
    // Not yet — auto-download may still supersede the prompt.
    expect(screen.queryByText('about.updateAvailableToast')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(screen.getByText('about.updateAvailableToast')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'about.download' }))
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  it('cancels the pending available prompt when auto-download starts', async () => {
    await renderNotifier(makeState('idle'))
    push(makeState('update-available'))
    push(makeState('downloading'))
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(screen.queryByText('about.updateAvailableToast')).not.toBeInTheDocument()
  })

  it('notifies ready at most once per version per session', async () => {
    await renderNotifier(makeState('idle'))
    push(makeState('ready'))
    expect(screen.getByText('about.updateReadyToast')).toBeInTheDocument()
    // Dismiss via the Alert close button, then let the exit transition finish.
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByText('about.updateReadyToast')).not.toBeInTheDocument()
    // A background re-check broadcasting the same ready version must not re-prompt.
    push(makeState('ready'))
    expect(screen.queryByText('about.updateReadyToast')).not.toBeInTheDocument()
  })

  it('re-prompts when a newer version becomes ready in the same session', async () => {
    await renderNotifier(makeState('idle'))
    push(makeState('ready', '9.9.9'))
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    act(() => {
      vi.advanceTimersByTime(500)
    })
    push(makeState('ready', '10.0.0'))
    expect(screen.getByText('about.updateReadyToast')).toBeInTheDocument()
  })
})
