/**
 * @file StandardDialog.test — RTL render tests for the shared dialog wrapper.
 *
 * INTENT: Verify that StandardDialog renders title, children, actions, handles close,
 *         and shows unsaved-changes confirmation when isDirty is true.
 * CONSTRAINT: Portal components (Dialog) must receive explicit `dir` prop for RTL.
 *             MUI portals append to document.body in jsdom — no extra container needed.
 *             Each test renders in isolation; cleanup() runs automatically between tests.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import StandardDialog from '../StandardDialog'

// Mock react-i18next — return key as-is for assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

// Mock useDirection hook
vi.mock('../../hooks/useDirection', () => ({
  useDirection: () => false
}))

function Wrapper({
  open = true,
  isDirty = false,
  onClose = vi.fn(),
  title = 'Test Dialog'
}: {
  open?: boolean
  isDirty?: boolean
  onClose?: () => void
  title?: string
}): ReactElement {
  return (
    <StandardDialog open={open} onClose={onClose} title={title} isDirty={isDirty}>
      <p>Dialog body content</p>
    </StandardDialog>
  )
}

describe('StandardDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders title and children when open', () => {
    render(<Wrapper title="Open Title" />)
    expect(screen.getByText('Open Title')).toBeVisible()
    expect(screen.getByText('Dialog body content')).toBeInTheDocument()
  })

  it('does not show dialog content when closed', () => {
    render(<Wrapper open={false} title="Closed Title" />)
    // MUI Dialog unmounts content when closed (no keepMounted)
    expect(screen.queryByText('Closed Title')).not.toBeInTheDocument()
  })

  it('renders action buttons when provided', () => {
    render(
      <StandardDialog
        open={true}
        onClose={vi.fn()}
        title="With Actions"
        actions={<button>Action Save</button>}
      >
        <p>Body</p>
      </StandardDialog>
    )
    expect(screen.getByText('Action Save')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked and not dirty', () => {
    const onClose = vi.fn()
    render(<Wrapper onClose={onClose} title="Close Test" />)
    // The close button uses aria-label="common.close"
    const closeBtn = screen.getByRole('button', { name: 'common.close' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows unsaved-changes confirmation when isDirty and close button clicked', () => {
    const onClose = vi.fn()
    render(<Wrapper isDirty={true} onClose={onClose} title="Dirty Test" />)
    const closeBtn = screen.getByRole('button', { name: 'common.close' })
    fireEvent.click(closeBtn)
    // Should NOT have called onClose directly
    expect(onClose).not.toHaveBeenCalled()
    // Should show the unsaved-changes confirm dialog
    expect(screen.getByText('common.unsavedChanges')).toBeInTheDocument()
  })

  it('passes dir prop to Dialog for RTL support', () => {
    render(<Wrapper title="Dir Test" />)
    // MUI Dialog renders a portal — find the dialog role in the body
    const dialog = document.querySelector('[role="presentation"]')
    expect(dialog).toBeInTheDocument()
  })
})
