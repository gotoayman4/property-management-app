/**
 * @file PropertyForm.test — regression tests for the create/edit property form dialog.
 *
 * INTENT: Verify the dialog close-path fixes specific to PropertyForm, which owns its
 *         StandardDialog (unlike Tenant/Contract forms):
 *         1. Save is disabled while the form is pristine (auto-filled defaults do not count).
 *         2. Creating a property shows the Documents-tab hint snackbar.
 *         3. After a successful create the form baseline is reset, so the title-bar X
 *            closes immediately (regression: it previously showed a spurious
 *            unsaved-changes confirmation because isDirty was never cleared).
 * CONSTRAINT: window.api is stubbed per test — no IPC/main process in jsdom.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PropertyForm from '../PropertyForm'

// Mock react-i18next — return key as-is for assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

// Sub-dialogs/tabs with their own IPC calls — irrelevant here
vi.mock('../../../components/EntityDocumentsTab', () => ({
  default: () => null
}))
vi.mock('../../../components/CountryManagerDialog', () => ({
  default: () => null
}))

const propertiesApi = {
  generateCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn()
}
const settingsApi = { get: vi.fn() }

const countries = [{ id: 1, code: 'TR', name: 'Turkey', default_currency: 'TRY', is_active: 1 }]

describe('PropertyForm', () => {
  beforeEach(() => {
    propertiesApi.generateCode.mockResolvedValue('TR-AP-001')
    propertiesApi.create.mockResolvedValue({ id: 3, code: 'TR-AP-001' })
    settingsApi.get.mockResolvedValue({ default_country: 'TR' })
    Object.defineProperty(window, 'api', {
      value: { properties: propertiesApi, settings: settingsApi },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('create mode: Save is disabled until the user modifies a field', async () => {
    render(
      <PropertyForm
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        property={null}
        countries={countries}
      />
    )
    // Country/currency/code auto-fill must NOT enable Save on their own
    await screen.findByDisplayValue('TR-AP-001')

    const saveBtn = screen.getByRole('button', { name: 'common.save' })
    expect(saveBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/property\.name/), {
      target: { value: 'Marina Apartment' }
    })
    await waitFor(() => expect(saveBtn).toBeEnabled())
  })

  it('create mode: after save, the title-bar X closes without an unsaved-changes prompt', async () => {
    const onClose = vi.fn()
    render(
      <PropertyForm
        open
        onClose={onClose}
        onSuccess={vi.fn()}
        property={null}
        countries={countries}
      />
    )
    await screen.findByDisplayValue('TR-AP-001')

    fireEvent.change(screen.getByLabelText(/property\.name/), {
      target: { value: 'Marina Apartment' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(propertiesApi.create).toHaveBeenCalledTimes(1))
    // Regression #2: create success points the user at the Documents tab
    expect(await screen.findByText('common.saveSuccessWithDocuments')).toBeInTheDocument()

    // Regression #3: X (first common.close button, in the dialog title) must close
    // directly — the saved form is no longer dirty, so no discard confirmation.
    const closeButtons = screen.getAllByRole('button', { name: 'common.close' })
    fireEvent.click(closeButtons[0])
    expect(screen.queryByText('common.unsavedChanges')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
