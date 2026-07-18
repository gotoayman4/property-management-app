/**
 * INTENT: Provide display-only currency conversion for any monetary amount entered in a form.
 *         Fetches the latest exchange rate for the source currency → each target currency and
 *         computes the converted amount on demand.
 * CONSTRAINT: Conversion is display-only (BR-13, FR-FX-06). The result never mutates the stored
 *             amount or currency — only the CurrencyInput preview shows it.
 * CAVEAT: If no rate exists for a pair, that conversion entry is null. The CurrencyInput
 *         gracefully shows the "no rate" label.
 */
import { useEffect, useRef, useState } from 'react'

export interface ConversionResult {
  convertedAmount: number | null
  currency: string
  rateDate?: string
}

const TARGET_CURRENCIES = ['USD', 'JOD', 'QAR']

export function useCurrencyConversion(amount: number, currency: string): ConversionResult[] {
  const [conversions, setConversions] = useState<ConversionResult[]>(
    TARGET_CURRENCIES.map((c) => ({ convertedAmount: null, currency: c }))
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!amount || amount <= 0 || !currency) {
      return
    }

    timerRef.current = setTimeout(async () => {
      const results = await Promise.all(
        TARGET_CURRENCIES.map(async (target) => {
          if (target === currency) {
            return { convertedAmount: amount, currency: target, rateDate: undefined }
          }
          try {
            const rateData = await window.api.exchangeRates.latest({
              currency_from: currency,
              currency_to: target
            })
            if (rateData) {
              return {
                convertedAmount: amount * rateData.rate,
                currency: target,
                rateDate: rateData.effective_date
              }
            }
          } catch {
            // Graceful fallback — no rate available for this pair
          }
          return { convertedAmount: null, currency: target }
        })
      )
      setConversions(results)
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [amount, currency])

  return conversions
}
