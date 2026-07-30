/**
 * INTENT: Shared notification helpers used by NotificationCenter and NotificationBell —
 *         single source of truth for the notification row shape returned by
 *         `notifications:list` and for the WhatsApp-eligibility rule.
 *
 * CONSTRAINT: `notifications:list` joins tenant phone fields only for tenant-addressable
 *             types; other rows carry `tenant_phone = undefined/null`, which is exactly
 *             what `canSendWhatsApp` gates on.
 */

/** Row shape returned by the `notifications:list` IPC channel. */
export interface NotificationRow {
  id: number
  notification_type: string
  entity_type: string
  entity_id: number
  title: string
  message: string
  due_date: string | null
  is_read: number
  read_at?: string | null
  created_at: string
  tenant_phone?: string | null
  tenant_country_code?: string | null
}

// Tenant-facing notification types where forwarding the message over WhatsApp makes sense.
const WHATSAPP_ELIGIBLE_TYPES = new Set([
  'rent_due',
  'overdue',
  'arrears_summary',
  'contract_expiry',
  'escalation_upcoming'
])

/** True when the notification can be forwarded to the tenant via WhatsApp deep-link. */
export function canSendWhatsApp(n: NotificationRow): boolean {
  return WHATSAPP_ELIGIBLE_TYPES.has(n.notification_type) && !!n.tenant_phone
}
