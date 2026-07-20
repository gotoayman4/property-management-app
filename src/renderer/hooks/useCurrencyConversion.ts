/**
 * INTENT: Provide display-only currency conversion for any monetary amount entered in a form.
 *         Fetches the latest exchange rate from the source currency to a single target currency
 *         (the configured reporting currency) and computes the converted amount on demand.
 * CONSTRAINT: Conversion is display-only (BR-13, FR-FX-06). The result never mutates the stored
 *             amount or currency — only the CurrencyInput preview shows it.
 * CONSTRAINT: The IPC (exchangeRates:latest) resolves reverse-rate fallbacks (BR-15), so a stored
 *             `USD→JOD` row also satisfies a `JOD→USD` request. No client-side inversion needed.
 * DECISION: Single target = the reporting currency (settings.reporting_currency), so the preview
 *           reflects the same consolidation base the dashboard/reports use. Returns an array
 *           (one element) to keep the existing CurrencyInput API stable across the three forms.
 * CAVEAT: If no rate exists for the pair, that conversion entry is null. The CurrencyInput
 *         gracefully shows the "no rate" label.
 */
import { useEffect, useRef, useState } from 'react'

export interface ConversionResult {
  convertedAmount: number | null
  currency: string
  rateDate?: string
}

/**
 * Default target when no reporting currency has been configured yet (before settings load).
 * Overridden by the `targetCurrency` argument passed by the form.
 */
const DEFAULT_TARGET_CURRENCY = 'USD'

export function useCurrencyConversion(
  amount: number,
  currency: string,
  targetCurrency: string = DEFAULT_TARGET_CURRENCY
): ConversionResult[] {
  const target = targetCurrency || DEFAULT_TARGET_CURRENCY
  const [conversions, setConversions] = useState<ConversionResult[]>([
    { convertedAmount: null, currency: target }
  ])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!amount || amount <= 0 || !currency) {
      return
    }

    timerRef.current = setTimeout(async () => {
      // Identity: source === target. No IPC round-trip needed.
      if (target === currency) {
        setConversions([{ convertedAmount: amount, currency: target }])
        return
      }

      try {
        const rateData = await window.api.exchangeRates.latest({
          currency_from: currency,
          currency_to: target
        })
        if (rateData && rateData.rate > 0) {
          setConversions([
            {
              convertedAmount: amount * rateData.rate,
              currency: target,
              rateDate: rateData.effective_date
            }
          ])
          return
        }
      } catch {
        // Graceful fallback — no rate available for this pair
      }
      setConversions([{ convertedAmount: null, currency: target }])
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [amount, currency, target])

  return conversions
}
