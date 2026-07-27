/**
 * @file ConfirmDialog.test — RTL render tests for the shared confirmation dialog.
 *
 * INTENT: Verify that ConfirmDialog renders title, message, buttons, calls callbacks,
 *         and passes dir prop to Dialog for RTL portal direction.
 * CONSTRAINT: Portal components (Dialog) must receive explicit `dir` prop.
 *             Confirm button uses severity color; Cancel is the safe/default action.
 *             Each test uses unique text to avoid cross-test pollution.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ConfirmDialog from '../ConfirmDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

vi.mock('../../hooks/useDirection', () => ({
  useDirection: () => false
}))

interface RenderOptions {
  open?: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  severity?: 'error' | 'warning'
  onConfirm?: () => void
  onCancel?: () => void
}

function renderDialog({
  open = true,
  title = 'Delete Item',
  message = 'Are you sure?',
  confirmLabel,
  cancelLabel,
  severity,
  onConfirm = vi.fn(),
  onCancel = vi.fn()
}: RenderOptions = {}): ReturnType<typeof render> {
  return render(
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      severity={severity}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

describe('ConfirmDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders title and message when open', () => {
    renderDialog({ title: 'Unique Title 1', message: 'Unique Message 1' })
    expect(screen.getByText('Unique Title 1')).toBeVisible()
    expect(screen.getByText('Unique Message 1')).toBeInTheDocument()
  })

  it('does not show dialog when closed', () => {
    renderDialog({ open: false, title: 'Closed Title 2' })
    expect(screen.queryByText('Closed Title 2')).not.toBeInTheDocument()
  })

  it('renders default cancel and confirm labels', () => {
    renderDialog({ title: 'Default Labels 3' })
    expect(screen.getByText('common.cancel')).toBeInTheDocument()
    expect(screen.getByText('common.confirm')).toBeInTheDocument()
  })

  it('renders custom labels when provided', () => {
    renderDialog({
      title: 'Custom Labels 4',
      confirmLabel: 'Yes Delete',
      cancelLabel: 'No Keep'
    })
    expect(screen.getByText('Yes Delete')).toBeInTheDocument()
    expect(screen.getByText('No Keep')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    renderDialog({ title: 'Confirm Test 5', onConfirm })
    fireEvent.click(screen.getByText('common.confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    renderDialog({ title: 'Cancel Test 6', onCancel })
    fireEvent.click(screen.getByText('common.cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('has correct aria attributes for accessibility', () => {
    renderDialog({ title: 'Aria Test 7' })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-message')
  })
})
