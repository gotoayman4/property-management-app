# Changelog

All notable changes to PropManager (مدير العقار) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

Release notes on GitHub Releases are generated from this file (`scripts/extract-changelog.mjs`), so every release MUST have a section here before tagging.

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

[1.2.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.2.0
[1.1.1]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.1.1
[1.1.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.1.0
[1.0.2]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.2
[1.0.1]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.1
[1.0.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.0
