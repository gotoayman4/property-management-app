/**
 * @file NotificationBell.test — RTL render tests for the notification bell popover.
 *
 * INTENT: Verify that NotificationBell renders the bell icon, opens a popover on click,
 *         shows notifications, and exposes the mark-all-read action.
 * CONSTRAINT: Portal components (Popover) must receive explicit `dir` prop for RTL.
 *             window.api.notifications is mocked — no real IPC calls.
 *             Real timers used (the 30s polling interval is too long to fake reliably here).
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import NotificationBell from '../NotificationBell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

vi.mock('../../hooks/useDirection', () => ({
  useDirection: () => false
}))

const mockUnreadCount = vi.fn()
const mockList = vi.fn()
const mockMarkRead = vi.fn()
const mockMarkAllRead = vi.fn()

interface MockWindow {
  api: {
    notifications: {
      unreadCount: typeof mockUnreadCount
      list: typeof mockList
      markRead: typeof mockMarkRead
      markAllRead: typeof mockMarkAllRead
    }
  }
}

beforeEach(() => {
  mockUnreadCount.mockReset()
  mockList.mockReset()
  mockMarkRead.mockReset()
  mockMarkAllRead.mockReset()
  mockUnreadCount.mockResolvedValue({ count: 2 })
  mockList.mockResolvedValue([
    {
      id: 1,
      notification_type: 'rent_due',
      title: 'Rent Due',
      message: 'Rent is due for Property A',
      due_date: '2026-08-01',
      is_read: 0,
      created_at: '2026-07-27T10:00:00Z'
    },
    {
      id: 2,
      notification_type: 'contract_expiry',
      title: 'Contract Expiring',
      message: 'Contract expires soon',
      due_date: null,
      is_read: 1,
      created_at: '2026-07-26T10:00:00Z'
    }
  ])
  mockMarkRead.mockResolvedValue(undefined)
  mockMarkAllRead.mockResolvedValue(undefined)
  // Extend the existing jsdom window instead of replacing it (Popover needs window.addEventListener)
  const w = window as unknown as MockWindow
  w.api = {
    notifications: {
      unreadCount: mockUnreadCount,
      list: mockList,
      markRead: mockMarkRead,
      markAllRead: mockMarkAllRead
    }
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Remove the api mock so it doesn't leak into other test files
  ;(window as unknown as { api?: MockWindow['api'] }).api = undefined
})

describe('NotificationBell', () => {
  it('renders the bell icon button', () => {
    render(<NotificationBell />)
    expect(screen.getByRole('button', { name: 'notifications.label' })).toBeInTheDocument()
  })

  it('shows unread count badge after fetching', async () => {
    render(<NotificationBell />)
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('opens popover on bell click and shows notifications', async () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.label' }))
    await waitFor(() => {
      expect(screen.getByText('notifications.title')).toBeInTheDocument()
      expect(screen.getByText('Rent is due for Property A')).toBeInTheDocument()
      expect(screen.getByText('Contract expires soon')).toBeInTheDocument()
    })
  })

  it('shows empty state when no notifications', async () => {
    mockList.mockResolvedValue([])
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.label' }))
    await waitFor(() => {
      expect(screen.getByText('notifications.empty')).toBeInTheDocument()
    })
  })

  it('shows mark-all-read button when unread count > 0', async () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.label' }))
    await waitFor(() => {
      expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument()
    })
  })

  it('calls markAllRead when mark-all-read button is clicked', async () => {
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.label' }))
    await waitFor(() => {
      expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('notifications.markAllRead'))
    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalledTimes(1)
    })
  })
})
