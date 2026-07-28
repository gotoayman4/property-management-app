/**
 * @file ContractForm.test — regression tests for the create/edit contract form.
 *
 * INTENT: Verify the property dropdown is populated from properties:list without a
 *         client-side status pre-filter (regression: a vacant-only filter emptied the
 *         dropdown whenever properties were rented or under maintenance, blocking
 *         contract creation entirely).
 * CONSTRAINT: window.api is stubbed per test — no IPC/main process in jsdom. Overlap
 *             protection is a main-process concern (CONTRACT_OVERLAPS), not the form's.
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ContractForm } from '../ContractForm'

// Mock react-i18next — return key as-is for assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

// Documents tab performs its own IPC calls — irrelevant here
vi.mock('../../../components/EntityDocumentsTab', () => ({
  default: () => null
}))

const propertiesApi = { list: vi.fn() }
const tenantsApi = { list: vi.fn() }

const allProperties = [
  {
    id: 1,
    code: 'TR-AP-001',
    name: 'Marina Apartment',
    status: 'vacant',
    monthly_rent_default: 500,
    currency: 'USD'
  },
  {
    id: 2,
    code: 'TR-AP-002',
    name: 'Harbor Flat',
    status: 'rented',
    monthly_rent_default: 750,
    currency: 'USD'
  },
  {
    id: 3,
    code: 'TR-SH-001',
    name: 'Corner Shop',
    status: 'maintenance',
    monthly_rent_default: 900,
    currency: 'TRY'
  }
]

const tenants = [{ id: 10, code: 'T-001', fullname: 'Ahmad Ali', is_active: 1 }]

describe('ContractForm', () => {
  beforeEach(() => {
    propertiesApi.list.mockResolvedValue(allProperties)
    tenantsApi.list.mockResolvedValue(tenants)
    Object.defineProperty(window, 'api', {
      value: { properties: propertiesApi, tenants: tenantsApi },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  /** Opens the property Select (MUI renders the display element as mui-component-select-<name>). */
  const openPropertySelect = async (): Promise<HTMLElement> => {
    await waitFor(() => expect(propertiesApi.list).toHaveBeenCalledTimes(1))
    const trigger = document.getElementById('mui-component-select-property_id')
    expect(trigger).not.toBeNull()
    fireEvent.mouseDown(trigger as HTMLElement)
    return await screen.findByRole('listbox')
  }

  it('create mode: property dropdown lists ALL properties regardless of status', async () => {
    render(<ContractForm contract={null} onSuccess={vi.fn()} onCancel={vi.fn()} />)

    const listbox = await openPropertySelect()
    // Regression: rented/maintenance properties previously disappeared from the list
    expect(await within(listbox).findByText('Marina Apartment (TR-AP-001)')).toBeInTheDocument()
    expect(within(listbox).getByText('Harbor Flat (TR-AP-002)')).toBeInTheDocument()
    expect(within(listbox).getByText('Corner Shop (TR-SH-001)')).toBeInTheDocument()
    expect(within(listbox).getAllByRole('option')).toHaveLength(allProperties.length)
  })

  it('create mode: selecting a property auto-fills its rent and currency', async () => {
    render(<ContractForm contract={null} onSuccess={vi.fn()} onCancel={vi.fn()} />)

    const listbox = await openPropertySelect()
    fireEvent.click(await within(listbox).findByText('Harbor Flat (TR-AP-002)'))

    // Rent amount is auto-filled from the selected property's default
    expect(await screen.findByDisplayValue('750')).toBeInTheDocument()
  })
})
