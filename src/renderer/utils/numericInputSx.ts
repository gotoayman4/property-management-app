/**
 * @file numericInputSx — shared SxProps for hiding the browser's numeric spinner buttons.
 *
 * INTENT: Replace the 6+ duplicated `SPINNER_LESS` / inline spinner-hide CSS objects across
 *         AmountField, BackupSettingsCard, DualCurrencySummary, ReceiptSettingsCard,
 *         ReminderSettingsCard, and ExchangeRateManager.
 *
 * CAVEAT: Use with MUI `sx` prop on `<TextField>`, `<Input>`, or `<NumberField>`.
 *         Does NOT apply to `<AmountField>` (which has its own built-in).
 */

/** SxProps that hide webkit and Firefox numeric spinners on number inputs. */
export const numericInputSx = {
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0
  },
  MozAppearance: 'textfield'
} as const
