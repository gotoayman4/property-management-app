/**
 * INTENT: Centralised WhatsApp deep-link builder used by NotificationCenter and TenantList.
 *         Normalises country code + phone into the format wa.me expects (digits only, no '+')
 *         and optionally appends a pre-filled message via the ?text= query parameter.
 *
 * CONSTRAINT: wa.me requires the phone number in international format WITHOUT the leading '+'
 *             or spaces. The message parameter must be URL-encoded.
 *
 * CAVEAT: The ?text= parameter has a practical length limit (~2000 chars after encoding).
 *         Notification messages in this app are short, so this is not a concern here.
 */
export function buildWhatsAppUrl(phone: string, countryCode?: string, message?: string): string {
  const normalised = `${countryCode ?? ''}${phone ?? ''}`.replace(/^\+?/, '').replace(/\s/g, '')
  let url = `https://wa.me/${normalised}`
  if (message) {
    url += `?text=${encodeURIComponent(message)}`
  }
  return url
}
