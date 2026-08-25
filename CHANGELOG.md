# Changelog

All notable changes to PropManager (مدير العقار) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

Release notes on GitHub Releases are generated from this file (`scripts/extract-changelog.mjs`), so every release MUST have a section here before tagging.

## [1.8.0] - 2026-08-25

### Added

- Upload the company's authorized-signature image in Settings → Company Information, and it appears automatically on every payment receipt above the authorized-signature line (on screen and in print)
- Signature images go through the same security validation as logos: only PNG/JPG are accepted, checked by file content rather than file extension

## [1.7.0] - 2026-08-25

### Added

- A "Full Screen View" button in the receipt dialog footer expands the receipt to fill the screen, making it easier to read everything at once — click again (or "Exit Full Screen") to return to the compact view

### Changed

- The receipt layout is now vertically compact — tighter spacing and smaller secondary text mean most receipts fit on screen without scrolling
- Signatures keep generous space on the printed paper even though they are compact on screen

## [1.6.0] - 2026-08-25

### Added

- Payment receipts are now far more informative: tenant phone and email, property code next to the property name, covered rent periods, and a separate receipt issue date alongside the payment date
- Each receipt now shows small note lines with the tenant's remaining due as of that payment's date (future months are never counted) and the previous payment before it (date, receipt number, and amount)
- Receipts can show the company address, phone, and email under the company name — set them in Settings

### Changed

- Every receipt is now printed in the TENANT's language: Arabic for Arabic tenants, English for everyone else — regardless of which language the app interface is currently using
- The amount box on receipts shows only this specific payment ("Amount Paid") instead of any computed totals
- All numbers on receipts use Western digits (0-9) even on Arabic receipts

### Fixed

- Opening a receipt could crash with "Cannot access 'rt' before initialization" or fail to load its context data
- Voided payments now clearly show a red "voided" banner with the reason, and their print button is disabled
- Date fields on Arabic receipts previously showed raw translation keys instead of month names

## [1.5.0] - 2026-08-19

### Added

- HTML report exports are now fully responsive — fluid typography, horizontally scrollable tables, stacked header/toolbar and touch-friendly targets on small screens, sticky table headers and full-width layout on desktop
- Client-side pagination in exported HTML reports (50 rows per page) with Previous/Next controls and a "Page X of Y" indicator
- Live search feedback in exported HTML reports: a "Showing X of Y rows" counter while typing, and a clear "no rows match" empty state
- Back-to-top link in the footer of long exported reports
- Accessible report tables: column scope, sort announcements (aria-sort), live status region, and hidden captions for screen readers

### Changed

- The summary chart in exported HTML reports now has a localized title and tooltips with currency-formatted values, and uses the report's design tokens instead of hardcoded colors
- Print output of exported HTML reports now force-shows filtered/paginated rows and keeps each currency group together on a page

### Fixed

- The chart title and the no-JavaScript notice in exported HTML reports were hardcoded English — both are now translated in Arabic and English exports (BR-29)

## [1.4.0] - 2026-08-19

### Added

- "PAID" (مدفوع) stamp watermark on printed payment receipts — a rotated green stamp overlaid on the receipt center, fully bilingual and printed together with the receipt

### Changed

- The default payment method for recorded payments is now bank transfer instead of cash — applies to fresh installs and to existing databases that never changed the setting (explicit user choices are preserved)

## [1.3.2] - 2026-08-03

### Added

- Edit and delete actions for opening due balances on the Rent Dues page — correct amount, date, or note mistakes on an opening balance that has not yet been collected (a confirmation dialog guards the delete)
- The opening-balance note is now visible in a dedicated column on both the Rent Dues list and the post-save Dues Review dialog, with a hover tooltip for long notes
- New "Edit Opening Due Balance" dialog mode that pre-fills the current amount, date, and note

### Fixed

- Adding a second opening due balance for the same contract no longer fails with a generic "An error occurred" — it now throws a specific, actionable message prompting the user to edit the existing balance instead (the root cause was a UNIQUE-constraint collision surfaced as an opaque error)

### Changed

- Opening due balances can only be edited or deleted while nothing has been collected against them (amount paid is 0 and status is pending); once a payment is applied they become immutable history
- Documented the hard-delete carve-out for never-collected opening balances in the rent_dues schema comment

## [1.3.1] - 2026-07-30

### Added

- Delete notifications individually or in bulk from the Notification Center, plus a "Clear all" action — each behind a confirmation dialog. Deletions are soft-dismissed so the evaluator does not recreate them
- WhatsApp share button in the notification bell popover for tenant-facing notifications (rent due, overdue, arrears, contract expiry)
- "View all" link in the bell popover to open the full Notification Center
- Tooltip on truncated notification messages showing the full text

### Changed

- Notification bell rows are now keyboard-focusable, and the unread badge refreshes when the popover closes and after marking notifications read
- Notification Center unread count now reflects the true database total instead of the capped fetched list, and timestamps render in the active language's locale

### Fixed

- Notification evaluation no longer aborts mid-run: fixed a document-expiry type mismatch and a deduplication conflict that could roll back the entire notification transaction (leaving notifications ungenerated)
- Restored the "dismiss" action, whose wiring between the UI and the main process was missing
- `read_at` is now recorded when a notification is marked read
- Corrected mislabeled Notification Center columns (read status, due date, created date)

## [1.3.0] - 2026-07-30

### Added

- Per-contract "Payment Due Day": each contract can now specify which day of the month its rent falls due (1 = start of month, the default; 31 = end of month — shorter months clamp to their last day). The setting drives both dues generation and notification timing
- New payment frequency "Every 4 months" (3 payments per year), selectable on contract creation and renewal

### Changed

- Rent Dues page now shows only dues due today or overdue — upcoming/future periods are hidden so the list reflects what currently needs collecting
- Dues Schedule report applies the same filter and excludes future periods
- Notifications simplified to one live notification per payment period: "rent due" fires only on the due date itself, and once the period is overdue the due notification is replaced by the overdue one — no more upcoming-due reminders or duplicates
- Arrears-summary notifications are now stable per tenant/contract instead of repeating daily
- "Opening balance" dues actions relabelled to "Opening due balance" (مستحق افتتاحي) for clarity

### Fixed

- Semi-annual contracts showed a raw translation key instead of "Semi-Annual" in the contract list and detail views

## [1.2.2] - 2026-07-30

### Fixed

- Notification bell unread counter now works — the `notifications:unreadCount` IPC handler was missing, so the renderer request silently failed
- Excel/report export no longer breaks in the packaged app — locale files are now inlined at build time instead of resolved from disk paths that don't exist after packaging

### Changed

- Native dependency install scripts (better-sqlite3, bcrypt, electron) are now explicitly approved under the npm 12 `allowScripts` policy so fresh installs rebuild native modules without prompts

## [1.2.1] - 2026-07-29

### Fixed

- Rent dues list now shows every outstanding due, including ones added with today's date — previously a newly added opening balance dated today did not appear until the next day
- The per-currency outstanding summary on the Rent Dues page now counts dues dated today as well

## [1.2.0] - 2026-07-29

### Added

- Rent dues (receivables) engine: rent obligations are now materialised into a `rent_dues` schedule per contract, with FIFO allocation against payments, reversal on payment void, and age-bucketed arrears tracking
- Dues list page (`/dues`) with outstanding/past-due periods across all contracts, aging chip indicators (0–30, 31–60, 61–90, 90+ days), and bulk actions (settle, waive, opening balance)
- Three dues mutation actions: settle-before-app (for periods predating the app), waive (for irrecoverable amounts), and opening balance — all non-ledger operations that adjust receivables without touching cash records
- Dues review dialog: appears automatically when a backdated contract is saved, letting the user mark historical periods as settled
- Arrears-summary notifications: one aggregate notification per tenant/contract when multiple periods are overdue, with `{months_overdue}` and `{total_outstanding}` variables
- Rent-due and overdue notification templates now include `{period}`, `{amount_due}`, and `{amount_outstanding}` variables
- Dashboard overdue section now sources real arrears from `rent_dues` instead of proxying from contract end dates, showing months-overdue count
- `overdue_balances` and `tenant_payment_history` reports rewritten to use true dues-based arrears with aging buckets (0–30, 31–60, 61–90, 90+ days)
- New report type `dues_schedule`: per-period per-currency rent dues schedule
- `StandardTable` now supports checkbox row selection for bulk actions
- `CoveredPeriodPicker` shows helper text listing months with outstanding dues to guide payment period allocation
- ESLint: new rule banning physical `left`/`right`/`top`/`bottom` in inline styles; hex-colour exemption for `theme.ts` and test files

### Changed

- Payment recording and void now allocate/reverse against the dues schedule inside the same transaction — cash and receivables can never diverge
- Contract create, edit, escalation-set, and renewal all regenerate the dues schedule automatically
- Notification evaluator rewritten to query `rent_dues` for real overdue periods instead of the old contract-end-date proxy
- App startup runs `extendDuesForActiveContracts()` before notification evaluation so evaluators see up-to-date arrears
- Sidebar now includes a Rent Dues entry between Payments and Expenses

### Fixed

- Payment period picker: unused `isRtl` variable removed
- ESLint config: `max-lines` rule moved to correct config object

## [1.1.3] - 2026-07-28

### Added

- Automatic contract renewal: contracts can opt in to auto-renew (with an optional fixed yearly increase %) — due contracts are renewed automatically at app launch, with the prior term preserved in the history log and a notification so the renewal is never silent
- Smarter manual renewal: the new end date is pre-filled from the prior term length, and an increase calculator (regular % plus a one-time adjustment) computes the new rent, with an old → new comparison summary before submitting
- Manual renewal can now amend the payment frequency and payment method for the new term
- Contract list shows expiry cues ("expires in N days" / past due) and an "auto" badge for auto-renewing contracts; the contract page shows a renewal banner with a one-click Renew button and an inline auto-renew toggle
- Expiry and auto-renewal notifications now deep-link straight into the renewal flow

## [1.1.2] - 2026-07-28

### Fixed

- Property dropdown in the new-contract form now lists all properties — previously it only showed vacant ones, so it appeared empty once properties were rented or under maintenance
- Saving a tenant without a national ID no longer fails after the first such tenant (blank national IDs are now stored correctly, existing records are repaired automatically)
- Tenant save errors now explain the actual problem (duplicate code, duplicate national ID, invalid fields) instead of a generic "Failed to save" message

## [1.1.1] - 2026-07-28

### Changed

- Save button in the property, tenant and contract dialogs is now disabled until there are actual changes to save, and disables again right after saving
- After creating a property, tenant or contract, the success message now points out that related documents can be uploaded from the Documents tab

### Fixed

- Close button (X and footer) now reliably closes the property, tenant and contract dialogs after saving — previously only Cancel worked and a spurious “unsaved changes” prompt could appear

## [1.1.0] - 2026-07-28

### Added

- Automatic update downloads: when a new version is found, the app now downloads it in the background (can be turned off in Settings → About & Updates)
- VS Code-style update notifications: a prompt with a Download button when an update is available, and a Restart button when it is ready to install
- About dialog available from the top bar (info icon) with app version, runtime details, links and a manual “Check for Updates” button

### Fixed

- Notification messages with an action button now always include a close button so they can be dismissed

## [1.0.2] - 2026-07-28

### Fixed

- App now restarts automatically after installing an in-app update (silent installer relaunch)
- Release/CI build pipelines updated to current GitHub Actions versions (Node 24 — removes deprecation warning)

## [1.0.1] - 2026-07-28

### Added

- App website link in Settings → About, next to the GitHub project page link

### Fixed

- Website download button now downloads the setup file directly instead of opening the releases page
- Website canonical/sitemap URLs corrected to the final production domain

## [1.0.0] - 2026-07-28

### Added

- Property, unit, tenant and contract management with an Arabic-first bilingual UI (RTL/LTR)
- Immutable financial ledger with reversal-based corrections and multi-currency display conversion
- Payment recording, rent posting, recurring expenses and deposit tracking
- Reports with Excel export
- Encrypted local backups with integrity verification, scheduled pruning and restore
- Notifications center for contract expiry and payment reminders
- Dark and light themes with full RTL mirroring
- Local authentication (bcrypt) for single-user desktop use
- In-app auto-update system: checks GitHub Releases, verifies SHA-256 integrity, silent Inno Setup upgrade (Settings → About)
- Bilingual (English/Arabic) Windows installer with per-user install, upgrade/downgrade handling and user-data preservation

[1.8.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.8.0
[1.7.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.7.0
[1.6.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.6.0
[1.5.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.5.0
[1.4.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.4.0
[1.3.2]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.3.2
[1.2.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.2.0
[1.1.1]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.1.1
[1.1.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.1.0
[1.0.2]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.2
[1.0.1]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.1
[1.0.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.0
