# App Hardening & Enhancement Plan

## Overview

This plan covers hardening and quality improvements across the existing codebase — no new features. Based on a full review of all main-process IPC handlers, DB layer, services, renderer components, pages, locales, and architecture.

The codebase is generally well-structured with good separation of concerns and solid security fundamentals (Zod validation everywhere, parameterized queries, CSP headers, magic-byte MIME validation, bcrypt auth). The issues below are incremental improvements to an already solid foundation.

---

## User Review Required

> [!IMPORTANT]
> All items here harden existing code, not add features. Batches 1–3 are safe to execute in sequence. Batch 4 (UI polish) has the highest visible impact and may surface minor layout changes. Review after each batch before proceeding to the next.

> [!WARNING]
> **Batch 5 (file splits)** involves splitting large IPC files (notificationIpc.ts at 522 lines, recurringExpenseIpc.ts at 552 lines, contractIpc.ts at 572 lines, dashboardIpc.ts at 478 lines, propertyIpc.ts at 412 lines). All IPC logic is unchanged — only file organization changes. No regressions expected, but a quick smoke test is recommended after.

---

## Proposed Changes

---

### Batch 1 — Main Process: Security & Error Hardening

High-impact safety fixes in the main/IPC layer. Many of these are currently consistent across write handlers but missing on read/delete primitives.

---

#### [MODIFY] [authIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/authIpc.ts)

**Issue (High):** `auth:changePassword` (line 135) accepts a raw `{ userId, currentPassword, newPassword }` object with **no Zod schema** — the only handlers without schema validation. `userId` is trusted from the renderer without an integer check.

**Fix:** Add a `changePasswordSchema` (z.object with int positive userId, string min/max password fields) and parse `data: unknown` through it.

---

#### [MODIFY] Multiple IPC handlers — missing ID validation

**Issue (High — Critical per audit):** The following handlers accept a primitive `id: number` directly without Zod parsing. A renderer sending `{}` or `null` would trigger an unhandled runtime error:

- `contracts:delete` — `(_, id: number)`
- `tenants:get`, `tenants:delete`
- `properties:get`, `properties:delete`
- `payments:get`
- `expenseCategories:delete`, `expenses:get`

**Fix:** Apply `z.number().int().positive().parse(data)` for all single-ID handlers (same pattern already used in `recurringExpenses:get`, `recurringExpenses:deactivate`, etc.).

---

#### [MODIFY] [notificationIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/notificationIpc.ts)

**Issue (High — lines 406–422):** `notifications:list` builds a dynamic query string but the `params` array is always empty — filters are injected as raw string concatenation (` AND is_read = 0`). While there's no user-interpolated value here, the pattern is fragile and inconsistent with every other handler.

**Fix:** Rewrite as `WHERE is_read = ?` with `params.push(0)` to stay consistent with the parameterized pattern.

**Issue (Medium — line 482):** `templates:update` receives `payload: { id: number; message_body: string }` directly instead of `data: unknown` parsed through Zod. If the renderer sends a non-number `id`, it reaches the DB unsanitized.

**Fix:** Add a Zod schema for the payload and use `data: unknown`.

---

#### [MODIFY] [recurringExpenseIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/recurringExpenseIpc.ts)

**Issue (Medium — lines 200–212):** Inside `processDueDateIfReached()`, the template row is fetched **twice** (lines 186–198 and 200–212) from the same table with two separate `db.prepare().get()` calls. This is an N+1 within a single function.

**Fix:** Merge the two SELECT statements into one `SELECT property_id, category_id, amount, currency, vendor_name, name FROM recurring_expense_templates WHERE id = ?`.

**Issue (Medium — lines 316–319):** Description for auto-generated recurring expenses (`"Auto-generated from recurring template…"`) is a hardcoded English string stored permanently in the ledger. It should use a locale key so the stored description is neutral.

**Fix:** Use a neutral key like `[recurring_auto:${template.name}:${dueDate}]` and resolve at display time, mirroring the existing `[deposit_forfeiture]` pattern.

---

#### [MODIFY] [contractIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/contractIpc.ts)

**Issue (Medium — lines 104–105):** `checkOverlap()` uses `.get(...params)` spread syntax. In better-sqlite3, `Statement.get()` does not accept a rest/spread of `unknown[]` — only named params or positional. This works only because JavaScript spreads the array, but loses type safety.

**Fix:** Use positional binding consistently: `db.prepare(query).get(propertyId, startDate, endDate)` (and add `excludeId` conditionally).

**Issue (Low — line 172, 191, 217, etc.):** Several handlers log `console.error(...)` in production. Per AGENTS.md, no console.log/error in prod.

**Fix:** Strip or gate all `console.error` calls in IPC handlers behind `if (isDev)`.

---

#### [MODIFY] [documentIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/documentIpc.ts)

**Issue (Low — line 87–96):** `resolveFilePath()` is exported but doesn't log when it falls back to the userData directory. Silent fallback makes debugging document-not-found issues hard.

**Fix:** Add a `console.warn` (gated behind dev mode) when the fallback path is used.

---

#### [MODIFY] [propertyIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/propertyIpc.ts)

**Issue (Low):** `settingsUpdateSchema` is defined at module top level inside `propertyIpc.ts` but it logically belongs to a settings domain. Low priority since it's internal, but noted for the file-split batch.

---

### Batch 2 — DB Layer: Performance & Correctness

---

#### [MODIFY] [ledgerService.ts](file:///d:/WebApps/property-management-app/src/main/db/ledgerService.ts)

**Issue (Medium — lines 363–380):** `generateReceiptNumber()` uses a `LIKE` pattern match on `receipt_number` to find the last sequential number. If the settings `receipt_prefix` contains SQL wildcard characters (`%` or `_`), the LIKE query would return wrong results. The `ESCAPE '\\'` is present but the prefix itself is not escaped.

**Fix:** Escape any `%` and `_` characters in `yearPrefix` before using it in the LIKE clause.

---

#### [MODIFY] [notificationIpc.ts — evaluateNotifications](file:///d:/WebApps/property-management-app/src/main/ipc/notificationIpc.ts)

**Issue (High — lines 115–402):** `evaluateNotifications()` runs **6 sequential DB queries** on app startup, each fetching all active contracts/documents/templates and looping. If the database grows large, this will noticeably slow app startup.

- Queries 1 & 2 (rent_due and overdue) both fetch ALL active contracts — they could be merged into one query.
- `resolveLanguage()` (line 105) is called inside the loop and does a separate `SELECT preferred_language FROM tenants WHERE id = ?` **for every contract** — classic N+1.

**Fix:**

- Merge queries 1 & 2 into a single `SELECT` that also JOINs tenant.preferred_language.
- Eliminate the `resolveLanguage()` per-row call by including `t.preferred_language` in the JOIN.

---

#### [MODIFY] [backupService.ts](file:///d:/WebApps/property-management-app/src/main/services/backupService.ts) + [backupIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/backupIpc.ts)

**Issue (High):** `createBackup()` runs synchronously on the main Electron thread: it performs WAL checkpoint, ZIP creation with `AdmZip`, recursive document directory reads, SHA-256 checksumming, and file stat — all blocking the Node.js event loop. For databases with many documents this freezes the UI during backup.

**Fix:** Wrap the backup operation in a `setImmediate` or move the CPU-intensive work to a `worker_threads` Worker. At minimum, move the checksum computation (`readFileSync` + sha256) to be async using `fs.promises.readFile`.

---

#### [MODIFY] [documentIpc.ts — documents:read](file:///d:/WebApps/property-management-app/src/main/ipc/documentIpc.ts)

**Issue (High):** `documents:read` reads entire files (up to 10 MB) into memory synchronously with `readFileSync`, encodes to base64 (~13.3 MB string), then transfers across IPC serialization. This unnecessarily bloats memory for document previews.

**Fix:** Register a custom `atom://` or `media://` Electron protocol handler to serve documents directly from disk, bypassing IPC for binary content. The renderer can then use an `<img src="media://document/123">` or iframe approach.

---

#### [MODIFY] [recurringExpenseIpc.ts — evaluateRecurringExpenses](file:///d:/WebApps/property-management-app/src/main/ipc/recurringExpenseIpc.ts)

**Issue (Medium — lines 156–169):** The evaluator fetches `SELECT * FROM recurring_expense_templates WHERE is_active = 1` then inside `processDueDateIfReached()` calls `db.prepare().get()` twice more per template (property lookup + full template reload). For a DB with 50+ recurring templates this is 100+ queries on startup.

**Fix:** Pre-JOIN the property currency in the initial `SELECT` so `processDueDateIfReached` gets all needed data in one shot from the outer loop.

---

#### [MODIFY] [database.ts](file:///d:/WebApps/property-management-app/src/main/db/database.ts)

**Issue (Low — line 59):** `db.pragma('journal_mode = WAL')` is set but `synchronous` is not explicitly set. WAL mode with `synchronous = NORMAL` is the recommended pairing for desktop apps (faster writes, still crash-safe). Currently defaults to `FULL` in WAL mode.

**Fix:** Add `db.pragma('synchronous = NORMAL')` after the WAL pragma.

**Issue (Low):** No `busy_timeout` is set. If the app opens a second instance (rare but possible in dev), it will throw immediately on a locked DB.

**Fix:** Add `db.pragma('busy_timeout = 5000')`.

---

### Batch 3 — Main Process: Code Quality & Architecture

---

#### [MODIFY] [dashboardIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/dashboardIpc.ts)

**Issue (Medium):** `toLocalISODate()` and `addDays()` helper functions (lines 37–49) are **duplicated** — identical copies exist in `recurringExpenseIpc.ts` and `notificationIpc.ts`.

**Fix:** Extract to `src/main/utils/dateUtils.ts` and import from there. The `src/main/utils/currencyHelper.ts` already exists as a precedent for this pattern.

---

#### [MODIFY] [main/index.ts](file:///d:/WebApps/property-management-app/src/main/index.ts)

**Issue (Low — line 41):** `sandbox: false` on `webPreferences` silences Electron's security warning but is weaker than `sandbox: true`. For a local Electron app with a preload script, sandbox can be enabled.

**Fix:** Evaluate whether `sandbox: true` works with the current preload (contextBridge pattern). If so, enable it for the extra process isolation.

**Issue (Low — lines 122–131):** The startup backup-prune runs a raw SQL query inline in `index.ts` — this is business logic that should be in `backupService.ts` or delegated to the backup scheduler.

**Fix:** Extract to a `loadBackupSettings(db)` helper in `backupService.ts`.

---

#### [NEW] [src/main/utils/dateUtils.ts](file:///d:/WebApps/property-management-app/src/main/utils/dateUtils.ts)

Shared date utility: `toLocalISODate(d: Date): string`, `addDays(d: Date, n: number): string`. Eliminate the 3-way duplication across dashboard, notification, and recurring expense IPC files (`dashboardIpc.ts`, `notificationIpc.ts`, `recurringSchedule.ts`, `reportService.ts` — 4 copies found).

---

#### [MODIFY] [searchIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/searchIpc.ts)

**Issue (Low–Medium):** `search:global` executes 6 sequential `LIKE %query%` full-table scans across properties, tenants, contracts, payments, expenses, and documents on every keystroke search. No FTS index exists.

**Fix (Phase A):** Add a debounce in the renderer (`useSnackbar`/`SearchBar`) so search fires at 300ms not every keystroke — renderer-only change, zero DB risk.

**Fix (Phase B, optional):** Add SQLite FTS5 virtual tables via a migration for the most searched entities (properties.name, tenants.fullname, contracts.contract_number). Measure first — only worthwhile if the DB grows beyond a few hundred rows.

---

### Batch 4 — Renderer: Bug Fixes, Accessibility & UI Hardening

This batch addresses real bugs (not style) found in the renderer. Several of these are silent failures that cause broken layouts and inaccessible forms.

---

#### [MODIFY] [StandardTable.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/StandardTable.tsx)

**Issue (Critical — line 163):** `maxW: 400` is Chakra UI syntax. MUI ignores it silently, meaning the intended max-width constraint on the search input is never applied.

**Fix:** Change to `maxWidth: 400`.

---

#### [MODIFY] [ReceiptDialog.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/ReceiptDialog.tsx)

**Issue (Critical — lines 112, 208):** `justify: 'space-between'` inside MUI `sx` is invalid (Chakra syntax). The flex layout is broken — items are not spaced correctly.

**Fix:** Replace with `justifyContent: 'space-between'` everywhere.

**Issue (High — line 133):** `textAlign: isRtl ? 'left' : 'right'` is a physical direction assignment. Violates AGENTS.md logical properties mandate.

**Fix:** Use `textAlign: 'end'` (logical) — automatically resolves to `right` in LTR and `left` in RTL.

**Issue (High — line 260):** `left: 0 !important` in print CSS.

**Fix:** Replace with `inset-inline-start: 0`.

**Issue (High — line 125):** `alt="Company Logo"` is hardcoded English.

**Fix:** Use `alt={t('settings.companyLogo')}`.

---

#### [MODIFY] [DualCurrencySummary.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/DualCurrencySummary.tsx)

**Issue (Critical — line 145):** `justify: 'space-between'` in MUI `sx` (invalid, same as ReceiptDialog).

**Fix:** `justifyContent: 'space-between'`.

**Issue (High — line 207):** `parseFloat(e.target.value)` inside `onChange` for the custom exchange rate input. When the user types `"1."` the parsed float is `1`, which React Hook Form writes back immediately, stripping the decimal point and making it impossible to enter decimal values.

**Fix:** Store the raw string value during typing and only parse to number on `onBlur`. Use `Controller`'s `onChange` to pass the raw string to RHF and `transform` on submit.

---

#### [MODIFY] [StandardDialog.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/StandardDialog.tsx)

**Issue (Critical — line 44):** `if (isDirty || reason === 'escapeKeyDown') { return }` — the `||` logic means **Escape is blocked even on clean (unmodified) forms**. This violates WCAG 2.1 AA keyboard navigation (users can never escape a dialog with the keyboard unless they make a form change first).

**Fix:** Correct the guard: only block close when `isDirty` AND reason is `backdropClick` (allow Escape always):

```
if (isDirty && reason === 'backdropClick') { return }
```

---

#### [MODIFY] [AmountField.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/AmountField.tsx)

**Issue (High — line 72):** `Number(e.target.value)` in the `onChange` handler converts `"10."` to `10`, stripping the trailing decimal point. This makes it impossible to type decimal amounts like `10.50` — a critical UX bug for a financial app.

**Fix:** Keep the raw string during typing; parse to number only on `onBlur` or at form submission level. Match the pattern from RHF + Zod where the schema coerces at submit time.

---

#### [MODIFY] [DepositStatusDialog.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/DepositStatusDialog.tsx)

**Issue (High — line 138):** Same `Number(e.target.value)` decimal-stripping bug in the deposit amount input.

**Fix:** Same pattern as AmountField — defer number coercion to blur/submit.

---

#### [MODIFY] [Layout.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/Layout.tsx)

**Issue (High):** `<Drawer anchor="left" ...>` is hardcoded. In Arabic (RTL) mode the navigation drawer stays physically on the left instead of mirroring to the right. This is a visible layout regression in the primary language of the app.

**Fix:** `anchor={direction === 'rtl' ? 'right' : 'left'}`

**Issue (High):** `aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}` — hardcoded English.

**Fix:** `aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}` + add keys to both locale files.

**Issue (Medium):** Theme and language toggle `IconButton` elements lack explicit `aria-label`; they rely only on `<Tooltip>` title which is not accessible to screen readers in all contexts.

**Fix:** Mirror the Tooltip title as `aria-label` on each `IconButton`.

---

#### [MODIFY] [DocumentUploadForm.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/DocumentUploadForm.tsx) + [ExpenseCategoryManagerDialog.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/ExpenseCategoryManagerDialog.tsx)

**Issue (Critical):** Both components call `useSnackbar()` and render `<GlobalSnackbar />` inside a child dialog. Because `<Layout>` already mounts `GlobalSnackbar` at the root, this creates **duplicate floating alerts** and layout shifts when notifications fire.

**Fix:** Remove the `<GlobalSnackbar />` render and local `useSnackbar()` from both. Use the global snackbar context already available at the layout level (if the hook operates on a shared store, no change needed; if these are local instances, migrate to the shared one).

---

#### [MODIFY] [PropertyImagesTab.tsx](file:///d:/WebApps/property-management-app/src/renderer/pages/properties/PropertyImagesTab.tsx) + [PropertyProfitabilityTab.tsx](file:///d:/WebApps/property-management-app/src/renderer/pages/properties/PropertyProfitabilityTab.tsx)

**Issue (High):** Both tabs return an empty fragment `<></>` during data fetch and have no error state. If the IPC call fails, the user sees a blank tab with no indication of what went wrong.

**Fix:** Add proper loading skeleton (MUI `Skeleton`) and error state with retry button, following the pattern in `StandardTable`.

---

#### [MODIFY] [StatCard.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/StatCard.tsx)

**Issue (Medium — lines 26–41):** `Card` with `onClick` acts as an interactive button but lacks `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers for Enter/Space activation. Keyboard users cannot activate dashboard stat cards.

**Fix:** Add `role="button"`, `tabIndex={0}`, and `onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onClick?.() : null}`.

---

#### [MODIFY] [SearchBar.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/SearchBar.tsx)

**Issue (Medium):** Global search `TextField` lacks an `aria-label` or visible `<label>` association. Screen readers cannot announce the field purpose.

**Fix:** Add `inputProps={{ 'aria-label': t('search.globalPlaceholder') }}`.

**Issue (Medium):** Search fires on every keystroke, triggering 6 LIKE scans per character. Add a 300ms debounce in the component (renderer-side fix, no DB changes).

**Fix:** Wrap the `onChange` handler in `useMemo(() => debounce(handler, 300), [])`.

---

#### [MODIFY] [FinancialSummaryCard.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/FinancialSummaryCard.tsx)

**Issue (Medium — lines 109, 120, 188, 199):** Positive/negative net profit conveyed by green vs red color only — WCAG 2.1 AA violation (never convey information through color alone).

**Fix:** Add explicit `+` / `-` prefix text to positive/negative values alongside the color indicator.

**Issue (Medium):** Receives `t` and `i18n` as props from parent instead of calling `useTranslation()` internally. Creates unnecessary prop drilling.

**Fix:** Remove the `t`/`i18n` props, call `useTranslation()` internally.

---

#### [MODIFY] [dashboardCharts.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/dashboardCharts.tsx)

**Issue (Medium — lines 24, 29, 206):** Receives raw `t` function as prop. Same prop-drilling anti-pattern.

**Fix:** Call `useTranslation()` internally and remove the prop.

---

#### [MODIFY] [PropertyProfitabilityTab.tsx](file:///d:/WebApps/property-management-app/src/renderer/pages/properties/PropertyProfitabilityTab.tsx)

**Issue (Low — lines 65, 80):** `.toLowerCase()` is called on translated strings. In Arabic mode this is a no-op and breaks sentence grammar (Arabic has no case concept).

**Fix:** Remove `.toLowerCase()`. If lowercase is needed for English display, conditionally apply only when `i18n.language !== 'ar'`.

---

#### [MODIFY] [ExpenseCategoryManagerDialog.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/ExpenseCategoryManagerDialog.tsx)

**Issue (Medium):** Edit and delete `IconButton` elements lack `aria-label`.

**Fix:** Add `aria-label={t('common.edit')}` / `aria-label={t('common.delete')}`.

---

#### [MODIFY] [AuthGate.tsx](file:///d:/WebApps/property-management-app/src/renderer/components/AuthGate.tsx)

**Issue (Medium):** If `auth:hasUsers` IPC call fails on first boot, the app shows a blank screen with no error state or retry.

**Fix:** Add explicit error state with retry button and translated error message.

---

#### [MODIFY] All page-level error handlers — IPC error code mapping

**Issue (High — Cross-cutting):** Many page components catch IPC errors and call `showError(error.message)` directly, displaying raw machine codes (`FAILED_TO_LIST_CONTRACTS`) to users.

**Fix:** Create `src/renderer/utils/errorMessages.ts` — a `resolveIpcError(error: unknown): string` function mapping known codes to i18n keys with a generic fallback. Update all pages to use it.

---

### Batch 5 — File Size: Split Oversized Files

Per AGENTS.md rule: files MUST NOT exceed 500 lines (plan for 300). Files found over the hard limit:

---

#### [MODIFY] [notificationIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/notificationIpc.ts) — 522 lines

**Split plan:**

- `evaluateNotifications()` → `src/main/services/notificationEvaluator.ts`
- `DEFAULT_TEMPLATES` constant → `src/main/services/notificationTemplates.ts`
- `registerNotificationIpcHandlers()` + template CRUD stays in `notificationIpc.ts`

---

#### [MODIFY] [recurringExpenseIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/recurringExpenseIpc.ts) — 552 lines

**Split plan:**

- `evaluateRecurringExpenses()` + helpers (`processDueDateIfReached`, `loadTemplateForSchedule`, etc.) → `src/main/services/recurringEvaluator.ts`
- IPC CRUD handlers stay in `recurringExpenseIpc.ts`

---

#### [MODIFY] [contractIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/contractIpc.ts) — 572 lines

**Split plan:**

- Helper functions (`checkOverlap`, `syncPropertyStatus`, `logHistory`) → `src/main/db/contractHelpers.ts`
- Zod schemas → `src/main/ipc/contractSchemas.ts`
- IPC handlers stay in `contractIpc.ts`

---

#### [MODIFY] [dashboardIpc.ts](file:///d:/WebApps/property-management-app/src/main/ipc/dashboardIpc.ts) — 478 lines

**Split plan:**

- Dashboard aggregation SQL helpers → `src/main/db/dashboardRepository.ts`
- IPC handler registration stays in `dashboardIpc.ts`

---

#### [MODIFY] [reportService.ts](file:///d:/WebApps/property-management-app/src/main/services/reportService.ts) — 550 lines (+ reportServiceExtended.ts at 405 lines)

These two companion files together are 955 lines of report generation.

**Split plan:**

- Extract shared formatting helpers → `src/main/services/reportFormatters.ts`
- Keep per-report generators in their respective files

---

#### [MODIFY] Large renderer page/component files (over 300-line soft target or 500-line hard limit)

| File                              | Lines   | Split Plan                                                          |
| --------------------------------- | ------- | ------------------------------------------------------------------- |
| `CountryManagerDialog.tsx`        | **516** | Split into `CountryListTable.tsx` + `CountryFormDialog.tsx`         |
| `PaymentForm.tsx`                 | **524** | Extract `PaymentDetailsSection`, `TenantSelector`, `PaymentSummary` |
| `NotificationTemplateManager.tsx` | 480     | Extract `TemplatePreviewAccordion` sub-component                    |
| `ContractForm.tsx`                | 462     | Extract `ContractBasicFields.tsx`, `ContractFinancialFields.tsx`    |
| `Reports.tsx`                     | 488     | Extract filter panel + per-report configs into `useReportConfig.ts` |
| `Ledger.tsx`                      | 475     | Extract ledger toolbar + filter logic into `useLedgerFilters.ts`    |
| `Dashboard.tsx`                   | 425     | Extract widget grid into `DashboardGrid.tsx`                        |
| `ContractDetail.tsx`              | 412     | Extract tab content into separate tab components                    |
| `BackupPage.tsx`                  | 418     | Extract backup log table + action strip into sub-components         |
| `Settings.tsx`                    | 385     | Extract each settings card section into sub-routes or lazy panels   |
| `Login.tsx`                       | 343     | Extract `RegisterForm` and `LoginForm` into sub-components          |
| `Layout.tsx`                      | 352     | Extract `NavSidebar`, `TopBar` into separate components             |

---

### Batch 6 — TypeScript Strictness

---

#### [MODIFY] [preload/index.ts](file:///d:/WebApps/property-management-app/src/preload/index.ts) + [preload/index.d.ts](file:///d:/WebApps/property-management-app/src/preload/index.d.ts)

**Issue (Medium):** Nearly every IPC call parameter is typed `data: unknown` or `filters?: unknown`. The `.d.ts` file (510 lines) mirrors this — widespread `unknown` across method signatures means the renderer has zero TypeScript assistance when constructing payloads.

**Fix:** Replace `unknown` with proper typed interfaces that match the Zod schemas. These interfaces should live in `src/renderer/types/ipc.ts` (shared) and be imported by both the preload `.d.ts` and renderer components. The `.d.ts` itself also exceeds 500 lines — restructure into grouped interface blocks.

---

#### [MODIFY] [src/renderer/types/ — NEW directory]

Create a shared types directory:

- `ipc.ts` — typed interfaces for all IPC payloads (matching Zod schemas)
- `entities.ts` — Property, Tenant, Contract, Payment, Expense, Ledger, Notification row shapes
- `settings.ts` — Settings row shape

This eliminates inline `as { foo: string }` casts scattered throughout components and page files.

---

### Batch 7 — Test Coverage Gaps

---

#### [NEW] Unit tests for `notificationEvaluator.ts`

The `evaluateNotifications()` function is currently **untested** but is critical business logic (reminder windows, language resolution). After the Batch 5 split, add Vitest tests covering:

- Rent due within window → notification inserted
- Rent due outside window → no notification
- Contract expiry → notification inserted
- Document expiry → notification inserted
- Idempotency: running twice doesn't create duplicates (INSERT OR IGNORE)

---

#### [NEW] Unit tests for `dashboardIpc.ts` aggregation queries

The dashboard summary calculations (total properties, financial sums) have no test coverage. Add tests with a seeded in-memory DB.

---

#### [NEW] Error code coverage test

Add a test that asserts every machine-readable error code returned from IPC handlers has a corresponding i18n key in both `ar.json` and `en.json`. This prevents the "raw error code in UI" regression.

---

## Verification Plan

### Automated Tests

```bash
npm run typecheck
npm run lint
npm run test
npm run check:i18n
```

### Manual Verification

- Run the app in dev mode: `npm run dev`
- Login, navigate all pages — no blank screens, no raw error codes visible
- Trigger a backup and restore flow
- Create a contract, payment, expense
- Verify dashboard loads correctly in both AR and EN
- Test recurring expense evaluation on startup (check console for errors)
- Verify notification bell shows correct counts

---

## Prioritization Summary

| Batch                      | Items                                     | Impact | Risk   | Effort |
| -------------------------- | ----------------------------------------- | ------ | ------ | ------ |
| 1 — IPC Security Hardening | auth schema, notification params          | High   | Low    | Small  |
| 2 — DB Performance         | N+1 in evaluators, startup queries        | High   | Low    | Medium |
| 3 — Code Quality           | date utils dedup, sandbox flag            | Medium | Low    | Small  |
| 4 — Renderer Hardening     | error mapping, loading states             | High   | Low    | Medium |
| 5 — File Splits            | 5 files over limit                        | Medium | Medium | Large  |
| 6 — TypeScript Strictness  | preload types, entity types               | Medium | Low    | Medium |
| 7 — Test Coverage          | notification eval, dashboard, error codes | Medium | Low    | Medium |
