/**
 * @file TenantForm.test — regression tests for the create/edit tenant form dialog.
 *
 * INTENT: Verify three fixed behaviors:
 *         1. Save is disabled while the form has no changes (pristine) and re-disables
 *            after a successful save (baseline reset).
 *         2. Creating a tenant shows the Documents-tab hint snackbar
 *            (common.saveSuccessWithDocuments), not the generic saveSuccess.
 *         3. After a successful create, a single Close button dismisses the dialog via
 *            the same path as Cancel (regression: it previously called onSuccess, which
 *            only refetched the list and never closed the dialog).
 * CONSTRAINT: window.api is stubbed per test — no IPC/main process in jsdom.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TenantForm } from '../TenantForm'

// Mock react-i18next — return key as-is for assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

// EntityDocumentsTab loads documents over IPC — irrelevant here
vi.mock('../../../components/EntityDocumentsTab', () => ({
  default: () => null
}))

const tenantsApi = {
  generateCode: vi.fn(),
  create: vi.fn(),
  update: vi.fn()
}

const sampleTenant = {
  id: 4,
  code: 'IND-004',
  fullname: 'Existing Tenant',
  phone: '5559999',
  type: 'individual' as const,
  is_active: 1
}

describe('TenantForm', () => {
  beforeEach(() => {
    tenantsApi.generateCode.mockResolvedValue('IND-001')
    tenantsApi.create.mockResolvedValue({ id: 7 })
    tenantsApi.update.mockResolvedValue({ id: 4 })
    Object.defineProperty(window, 'api', {
      value: { tenants: tenantsApi },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('create mode: Save is disabled until the user modifies a field', async () => {
    render(<TenantForm tenant={null} onSuccess={vi.fn()} onCancel={vi.fn()} />)
    // Wait for the auto-generated code (setValue must NOT mark the form dirty)
    await screen.findByDisplayValue('IND-001')

    const saveBtn = screen.getByRole('button', { name: 'common.save' })
    expect(saveBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/tenant\.fullname/), {
      target: { value: 'John Smith' }
    })
    await waitFor(() => expect(saveBtn).toBeEnabled())
  })

  it('create mode: successful save shows the Documents-tab hint and Close dismisses the dialog', async () => {
    const onSuccess = vi.fn()
    const onCancel = vi.fn()
    render(<TenantForm tenant={null} onSuccess={onSuccess} onCancel={onCancel} />)
    await screen.findByDisplayValue('IND-001')

    fireEvent.change(screen.getByLabelText(/tenant\.fullname/), {
      target: { value: 'John Smith' }
    })
    fireEvent.change(screen.getByLabelText(/tenant\.phone/), {
      target: { value: '5551234' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(tenantsApi.create).toHaveBeenCalledTimes(1))
    // Regression #2: create success points the user at the Documents tab
    expect(await screen.findByText('common.saveSuccessWithDocuments')).toBeInTheDocument()

    // Regression #3: a single Close button remains and it closes (Cancel path),
    // instead of the old onSuccess-only wiring that never dismissed the dialog.
    expect(screen.queryByRole('button', { name: 'common.save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.cancel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('edit mode: Save re-disables after a successful save (baseline reset)', async () => {
    render(<TenantForm tenant={sampleTenant} onSuccess={vi.fn()} onCancel={vi.fn()} />)

    const saveBtn = screen.getByRole('button', { name: 'common.save' })
    // Pristine edit form — nothing to save yet
    expect(saveBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/tenant\.fullname/), {
      target: { value: 'Renamed Tenant' }
    })
    await waitFor(() => expect(saveBtn).toBeEnabled())

    fireEvent.click(saveBtn)
    await waitFor(() => expect(tenantsApi.update).toHaveBeenCalledTimes(1))
    expect(tenantsApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, fullname: 'Renamed Tenant' })
    )
    // Baseline was reset — the form is clean again, so Save is disabled
    await waitFor(() => expect(saveBtn).toBeDisabled())
    expect(await screen.findByText('common.saveSuccess')).toBeInTheDocument()
  })
})
