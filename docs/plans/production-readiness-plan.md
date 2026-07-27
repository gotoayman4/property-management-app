# Production Readiness Plan — Property Management App

> Audit + actionable remediation roadmap. Built from a full evidence-based review of the
> Electron 43 / React 19 / MUI 9 / better-sqlite3 codebase. Every finding cites `file:line`.
> This file is a planning artifact only — implementation of the listed tasks is a separate effort.
> Companion (different, older) plan: `docs/plans/implementation_plan.md`.

**Audit scope date:** 2026-07-27
**Branch:** `main` @ `e09d666`

---

## Agent Usage Instructions

Read this entire plan before starting implementation. Execute tasks in the defined order unless
dependencies indicate otherwise. Complete one task at a time — implement, validate, then commit the
changes to Git before starting the next task. Mark tasks completed immediately after successful
validation and commit. Re-evaluate remaining tasks after each completed milestone. Do not skip
validation steps. If any requirement is ambiguous, conflicting, or incomplete, stop and request
clarification before proceeding. Treat this plan as the authoritative execution checklist unless
overridden by repository steering documents (`AGENTS.md`, `WORLD.md`).

---

## Repository Rules Summary (from `AGENTS.md` / `WORLD.md`)

Material constraints the remediation must respect:

- **SQL:** 100% parameterized statements. Never concatenate user strings into SQL.
- **Validation:** Zod at every IPC boundary (writes _and_ reads). Trust no renderer payload.
- **Atomicity:** Multi-table writes inside `db.transaction()`.
- **Ledger:** Immutable rows (no UPDATE/DELETE); corrections use reversal entries; transactional.
- **Auth:** optional by design (single-user app); bcrypt + Electron `safeStorage` when enabled;
  auth code gets 100% review. Enforcement in the main process is **not** required (see Threat Model).
- **Files:** Magic-byte MIME validation in the main process (`file-type@16.5.4`).
- **Electron:** No `nodeIntegration`, context isolation ON, no business logic in renderer.
- **UI:** `StandardTable`/`StandardDialog`/`PageHeader`/`CurrencyInput`/`GlobalSnackbar`; `AmountField`/MUI `NumberField` for numerics (no `<TextField type="number">`); design tokens only (no raw hex/px/fonts); logical CSS only; explicit `dir` on every portal; all strings via `t()`.
- **Files:** Source ≤300 (plan) / 500 (hard) lines — enforced by ESLint `max-lines`.
- **Commits:** Conventional commits; commit after each working increment; never commit broken code.
- **Forbidden deps:** no cloud/HTTP/WebSocket libs, no Tailwind/shadcn/Redux/SWR/React Query, no Tauri.

---

## Threat Model (read before re-classifying security findings)

**This is a single-user, offline desktop application.** The person at the keyboard owns the machine
_and_ the data. Authentication is **optional by design** — `require_auth` defaults to `0`
(`src/main/db/migrations/010_require_auth.sql:3`) and most users do not enable it. The renderer
auth gate (`AuthGate.tsx:26-28`) is therefore a **convenience lock, not a security boundary**, and an
"auth bypass" via IPC is **not a vulnerability** in this product — it is the intended behavior.

Consequences applied throughout this document:

- **Auth enforcement in the main process is out of scope** — no IPC auth middleware needed.
- Findings whose only impact is "an attacker who can invoke IPC reads the user's own data" are
  **downgraded** (e.g. `pickImage` SVG is a consistency/hardening item, not a blocker).
- Findings about **data reliability** (backup/restore correctness), **engineering process**
  (CI/CD), and **maintainability** (docs, file size) remain in force — they affect the user
  regardless of the threat model.

---

## 1. Executive Summary

| Metric                      | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **Overall readiness score** | **~78 / 100**                                                                          |
| **Readiness level**         | **Nearly Ready** (one reliability blocker + CI/docs to close)                          |
| **Verdict**                 | Not yet production-ready — one must-fix reliability blocker remains (see Threat Model) |

### Top strengths

- **Clean layering** — UI → preload → IPC → services/repositories → DB. Repositories hold the write
  paths; IPC files only delegate (no circular coupling).
- **Zod validation on every write handler** (payments, expenses, contracts, ledger, auth, documents,
  recurring expenses). Mutating handlers consistently parsed before DB touch.
- **Zero SQL injection surface** — every sampled `db.prepare()` uses `?` / `@name` placeholders;
  dynamic fragments are static SQL appended by internal flags, never user strings.
- **Strong security baseline** — CSP + `X-Frame-Options: DENY` + `nosniff` + `no-referrer`
  (`src/main/index.ts:157-169`); bcrypt with 10 rounds; OS-keychain remember-me (`authIpc.ts:193-207`).
- **Magic-byte MIME validation** on document uploads (`documentIpc.ts:106-119`); 10 MB cap; typed errors.
- **Immutable, transactional ledger** — no `UPDATE`/`DELETE` on `ledger_entries`; reversal entries for
  voids (`paymentRepository.ts:142-186`); running balances always recomputed, never cached.
- **Consistent design-system adoption** — `StandardTable` in 18 pages, `StandardDialog` in 9,
  `PageHeader` in 16, `useSnackbar`/`GlobalSnackbar` in 27 files; no raw `<Table>` or `alert()`.
- **Colors centralized** — raw hex confined to `theme/theme.ts`; components use `theme.palette.*`.
- **Atomic direction toggle** — `document.dir` + `theme.direction` + `i18n` + Emotion cache swap on a
  keyed remount (`App.tsx:118,143-157`); first-paint flicker guard in `index.html:13-34`.
- **i18n parity enforced** at build time (`scripts/check-i18n-parity.js`).
- **Solid unit coverage** on financial logic — payments (19), ledger (17), backup (36), file-upload
  MIME (10), escalation/recurring (62).
- **Pre-commit gate** — husky + lint-staged (eslint --fix, prettier) + i18n parity + typecheck.

### Top risks

- **Backup restore overwrites the open DB file** and the legacy `.db` path skips checksum
  verification — the one true must-fix (data-loss risk for the user's own records).
- **No CI/CD** — gates run only via local husky hook (bypassable with `--no-verify`).
- **No README / install / deploy docs.**
- **`dialog:pickImage` trusts the file extension and accepts SVG** — downgraded to a hardening item
  under this threat model (self-uploaded logo; impact is contained to the user's own machine).
- **~45 unguarded `console.error`** leak full error objects to stdout in production main-process code.

---

## 2. Critical Blockers

> **Re-scoped under the single-user threat model** (see Threat Model above). The former "auth
> bypass" item was removed entirely (auth is optional by design), and the former "`pickImage` SVG"
> blocker was downgraded to a Phase-2 hardening task (a self-uploaded logo's impact is contained to
> the user's own machine). The two remaining blockers are **reliability and process** issues that
> affect the user regardless of auth.

### B1 — Backup restore reliability (Severity: **High**)

- **Description:** `restoreFromBackup` calls `writeFileSync(dbPath, …)` while better-sqlite3 still
  holds the file open (`backupService.ts:312`), relying on app restart to pick up changes
  (`backupIpc.ts:199`). Legacy raw `.db` restore path skips the SHA-256 checksum
  (`backupService.ts:382-385`); ZIP-extraction errors are swallowed into `restoredZip = false`
  (`:378-380`) and fall through to the legacy path. On Windows, overwriting an open file can fail or
  leave a torn state.
- **Impact:** Corrupted-but-valid ZIP could partially restore documents then overwrite the DB;
  silent document loss when no full backup exists (`:352`); restore may not actually take effect.
  This is the one true must-fix — it can destroy the user's own financial/property records.
- **Solution:** Close/reopen the DB connection (or block writes) during restore; verify checksum on
  all restore paths; fail loudly on any ZIP error before falling back.

### B2 — No CI/CD (Severity: **Medium → High**)

- **Description:** `.github/workflows/` does not exist. All quality gates (lint, typecheck, i18n
  parity, unit tests, e2e) run only through the local `.husky/pre-commit` hook.
- **Impact:** Broken code can be pushed/merged on any branch where hooks were skipped (`--no-verify`)
  or where a contributor hasn't installed husky. No enforcement on PRs or over the maintained app's
  lifetime.
- **Solution:** Add a GitHub Actions workflow running `lint`, `typecheck`, `check:i18n`,
  `vitest run` on every pull request and push to `main`.

---

## 3. Detailed Findings by Category

> Format: Description / Root cause / Impact / Fix / Effort (S / M / L).
> File:line evidence from the audit.

### Architecture & Code Quality

- **Two source files exceed 500 lines** (`max-lines` only enforces new code; these predate or were
  missed). `src/renderer/pages/reports/Reports.tsx` (534), `src/main/ipc/recurringExpenseIpc.ts`
  (534). Root cause: feature accumulation. Impact: violates the 500-line mandate; harder to maintain.
  Fix: extract sub-components / split schemas from handlers. Effort: **M**.
- **Duplicated renderer logic** — spinner-less input CSS copy-pasted in `AmountField.tsx:150-156`,
  `BackupSettingsCard.tsx:56-62`, `ExchangeRateManager.tsx:45-49`; data-fetch boilerplate
  (`useState(loading/error)+useCallback+useEffect+console.error`) repeated in ~12 pages;
  `isRtl = i18n.language === 'ar'` recomputed in ~20 components. Root cause: no shared abstraction.
  Impact: drift risk, larger surface. Fix: extract `useFetch`/`useDirection` hooks + shared CSS.
  Effort: **M**.

### Functional Completeness

- **No logic bugs found** in sampled flows (payment void, expense void, ledger reversal, backup
  create/verify). Behavior is consistent and integrated correctly. No TODO/FIXME/HACK in renderer;
  main-process code carries none in production paths.
- **Dashboard swallows top-level fetch errors** silently (`Dashboard.tsx:101-102`); individual
  endpoints degrade via `.catch(() => [])` so a single failure doesn't break the whole page, but no
  user-visible error state for a full-dashboard failure. Fix: surface a retry banner on total
  failure. Effort: **S**.

### UI / UX

- **Raw `<TextField type="number">`** for `day_of_month` in `RecurringExpenseForm.tsx:357-365` —
  violates AGENTS mandate (every other numeric field uses `AmountField`/`CurrencyInput`). Fix: switch
  to `AmountField` (or MUI `NumberField`). Effort: **S**.
- **Missing i18n keys** `sidebar.expand` / `sidebar.collapse` — used via `Layout.tsx:280-281` with
  inline English `defaultValue`; absent from both `ar.json` and `en.json`. Result: English tooltips
  in Arabic UI. Fix: add keys to both locale files. Effort: **S**.
- **Physical CSS** — `ReconstructBalanceCard.tsx:48` uses
  `sx={{ textAlign: isRtl ? 'left' : 'right' }}` instead of logical `start`/`end`; `Layout.tsx:332`
  uses `<Drawer anchor="left">` (only physical anchor in the codebase; MUI auto-flips + `dir` is set,
  so likely correct, but flagged). Fix: logical properties. Effort: **S**.
- **Inline `fontFamily` overrides** at `NotificationTemplateManager.tsx:336-339,433-436` bypass
  theme typography (justified intent for template preview, but duplicates theme logic). Fix:
  expose a theme helper. Effort: **S**.
- **Hardcoded pixel literals** pervasive in `sx`/`style` (e.g. `StandardTable.tsx:148-149,235`,
  `Dashboard.tsx:116`, `Layout.tsx:155-157`, `StatCard.tsx:55-56`). Appears tolerated by current
  lint but contradicts AGENTS "no raw pixel values." Fix: design-token spacing where feasible; see
  Phase 2 lint rule. Effort: **M**.
- **Theme `light`/`dark` shades are mode-invariant** — `theme.ts:30,35,40,45,49,54` set the same hex
  regardless of mode. Most consumers use `main`, so impact is limited. Fix: differentiate per mode.
  Effort: **S**.
- **No component-level RTL unit tests** — only Playwright E2E (`e2e/smoke.spec.ts`) covers direction
  flipping. Fix: add RTL render tests for portal components. Effort: **M**.

### Performance

- **No measured bottleneck** (no profile run). Likely fine at this data scale (local SQLite, small
  result sets). Indexes look appropriate: `026_performance_indexes.sql` adds partial/composite
  indexes (e.g. `idx_contracts_tenant_status WHERE is_archived = 0`, `idx_notifications_unread`).
  **Caveat:** no bundle-size budget enforced; renderer is bundled by electron-vite with no
  code-splitting config. Effort to add budgets: **M** (defer to Phase 3 — profile first).

### Security (threat-model-aware)

- **`dialog:pickImage` trusts file extension + accepts SVG** (`dialogIpc.ts:50,63-66`), inconsistent
  with the magic-byte-validated document path (`documentIpc.ts:106-119`). Under the single-user
  threat model this is a **consistency / hardening** item, not a blocker: the user uploads their own
  logo and any impact is contained to their own machine. Fix: mirror `assertAcceptedFile` and
  reject/sanitize SVG. Effort: **S**. (Formerly Critical Blocker B2 — downgraded.)
- **Auth enforcement** — N/A. Authentication is optional by design for this single-user app
  (`require_auth` defaults off). The renderer gate is a convenience lock, not a security boundary.
  No main-process auth middleware is required. _(Formerly Critical Blocker B1 — removed.)_
- **`sandbox: false`** in BrowserWindow webPreferences (`index.ts:41`) — required because the preload
  uses `ipcRenderer` directly, but it weakens the renderer sandbox. Fix: document via ADR or migrate
  preload to use `contextBridge`-only IPC under sandbox. Effort: **M**.
- **Online FX fetch** to `https://open.er-api.com/v6/latest/...` (`exchangeRateIpc.ts:125-126`)
  via Electron `net.fetch` contradicts the "offline-only" CSP positioning; ADR-001 documents it as
  user-initiated with graceful degradation. Impact: information disclosure (anonymous rate lookup).
  Fix: keep gated + document; no code change strictly required. Effort: **S** (ADR-only).
- **~45 unguarded `console.error`** in production main-process code log full error objects (with
  stack) to stdout/stderr — `backupIpc.ts:60,84,96,110,211,226,245`, `ledgerIpc.ts:71,86,104,136`,
  `paymentIpc.ts:128`, `propertyIpc.ts` (15 sites), `dialogIpc.ts:36,71,102`, `dataIpc.ts:74`.
  Contradicts the codebase's own no-prod-logging rule (`authIpc.ts:8`). Fix: gate behind `isDev` or
  route through a structured logger. Effort: **M**.
- **Stack traces never reach the renderer** — `grep '\.stack' src/main` returns zero hits; errors
  cross IPC as machine-readable codes mapped via `src/renderer/utils/errorMessages.ts:43-61`.
  ✅ Confirmed safe.
- **Read-side handlers skip Zod** — `dashboardIpc.ts:20-90` (raw `country?`), `exchangeRateIpc.ts:33`
  (filters), `searchIpc.ts:21` (no max-length cap on `query`). Queries are parameterized (no
  injection), but inconsistent with write-side discipline. Fix: add Zod schemas. Effort: **S**.

### Database

- **Schema quality high** — 27 migrations, 18 FK declarations, extensive CHECK constraints
  (`005_financial_core.sql:23,70`, singleton `settings CHECK(id=1)`, `027_split_backup_types.sql:4`),
  composite/partial indexes.
- **Ledger immutability enforced only at the app layer** — `ledgerService.ts:13-18` documents the
  rule and exports no mutation API; CHECK constraint validates `entry_type`. **No DB-level trigger**
  prevents a stray `db.exec('UPDATE ledger_entries …')`. Fix: add a `BEFORE UPDATE/DELETE` trigger
  that raises `ABORT`. Effort: **S** (migration `028`).
- **WAL + foreign_keys ON** (`database.ts:59-60`). ✅ Correct.

### API / IPC Quality

- **115 IPC handlers**, `domain:verb` naming. Write handlers validate with Zod and wrap multi-table
  writes in `db.transaction()` (`paymentRepository.ts:61`, `expenseRepository.ts:62,132`,
  `documentIpc.ts:171,223,351`, `contractIpc.ts:125`, `dataIpc.ts:63-68`). ✅ Consistent.
- **Error responses use machine-readable codes** (`INVALID_INPUT`, `FAILED_TO_LIST_PAYMENTS`, …),
  never stack traces. ✅ Compliant.
- **No IPC channel catalog / payload documentation.** Fix: generate a catalog. Effort: **M**.
- **No pagination on a few list endpoints** — verify property/tenant/payment lists cap results
  (`LIMIT` present in `reportQueries.ts:120` via `REPORT_ROW_LIMIT+1`). Audit did not flag a missing
  cap on core lists, but worth a targeted check before production. Effort: **S**.

### Reliability & Resilience

- **No `process.on('uncaughtException'/'unhandledRejection')`** in `src/main/index.ts`; no
  `webContents.on('crashed'/'render-process-gone')`. Fix: add top-level handlers that surface a
  user-visible error and persist a crash log. Effort: **M**.
- **No structured logging / crash reporting** (no `electron-log`, no Sentry). Errors are thrown
  codes only — fine for the renderer, but main-process failures are unobserved. Fix: optional
  `electron-log` to `userData/logs`. Effort: **M**.

### Testing

- **30 test files / ~360 cases** — strong on financial, ledger, backup, MIME validation, escalation.
- **No coverage config / threshold** despite AGENTS claim of "coverage on financial logic." Fix:
  add `vitest` `coverage` block with thresholds on `src/main/db`, `src/main/services`. Effort: **M**.
- **E2E is smoke-only** — `e2e/smoke.spec.ts` (3 tests: boot, nav, language toggle). **No E2E for
  critical flows** (record payment, post rent, backup→restore) despite the mandate. Both `ar-rtl`
  and `en-ltr` projects exist (`playwright.config.ts:27,31`) ✅. Fix: add `financial.spec.ts`,
  `backup.spec.ts`. Effort: **L**.

### Deployment & DevOps

- **No CI/CD** (blocker B2).
- **Code signing not configured** — no `CSC_LINK`/`WIN.certificateFile`/`signingHashAlgorithms`;
  `notarize: false` (`electron-builder.yml:29`). Fix: wire signing via CI secrets. Effort: **M**.
- **Missing referenced file** `build/entitlements.mac.plist` (`electron-builder.yml:23`) — does not
  exist in `build/`. Fix: create it or remove the reference. Effort: **S**.
- **Placeholder auto-update URL** `https://example.com/auto-updates` (`electron-builder.yml:44`).
  Fix: real server or remove the `publish` block. Effort: **S**.

### Dependencies

- **MUI pinned to `9.0.0-alpha.0`** (pre-release) across `@mui/material`, `@mui/icons-material`,
  `@mui/x-data-grid`, `@mui/x-date-pickers` (`package.json:44-47`). WORLD.md/AGENTS.md frame MUI 9 as
  "production-tested," but `alpha.0` is not a stable release. Fix: pin to first stable 9.x when
  published, or write an ADR justifying the alpha. Effort: **S** (ADR) / **M** (upgrade).
- **`adm-zip ^0.6.0`** (`package.json:43`) — zero-major package (inherently unstable semver); used
  for backup ZIPs. Impact: low but worth an ADR note. Effort: **S**.
- **No forbidden packages present** — verified zero matches for Firebase/Supabase/NestJS/Express/
  axios/SWR/React Query/Redux/Tailwind/shadcn/Tauri/Socket.io/AWS SDK. ✅ Stack is clean.
- **No deprecated/obviously vulnerable versions** at pinned ranges; a real `npm audit` should still
  be run in CI. Effort: **S**.

### Documentation

- **No README.md anywhere** in the repo. `electron-builder.yml:9` excludes one that was never
  created. Fix: write README (install/build/run). Effort: **M**.
- **No install / deployment / onboarding / IPC docs.** Existing: `AGENTS.md`, `WORLD.md`,
  `ARCHITECTURE_INDEX.md`, `SRS_Property_Management_App_EN.md`, two ADRs. Fix: add the missing
  guides. Effort: **M**.
- **`CLAUDE.md` and `.github/copilot-instructions.md` are uncustomized starter templates** still
  containing `[FILL]` placeholders. Fix: customize or delete. Effort: **S**.

---

## 4. Prioritized Action Plan (vertical-slice, skill format)

> Each task lists Objective / Outcome / Files (with est. line counts, ≤300 plan / 500 hard) /
> Dependencies / Validation. Commit after each validated task.

### Phase 1 — Must Fix Before Production

**Dependencies:** None.

- [x] **Task 1.1 — Backup restore hardening** ✅ committed `8a5cfdf`
  - **Objective:** Make restore reliable and fail-loud on corruption (the one true must-fix).
  - **Outcome:** DB connection closed/reopened around restore (or writes blocked); SHA-256 verified
    on all restore paths (including legacy `.db`); ZIP-extraction errors abort instead of falling
    through.
  - **Files:** `src/main/services/backupService.ts` (modify ~40 lines),
    `src/main/ipc/backupIpc.ts` (modify ~10 lines),
    `src/main/services/__tests__/backupService.test.ts` (add ~60 lines).
  - **Dependencies:** None.
  - **Validation:** new tests for corrupted-zip abort and legacy-path checksum failure; existing
    backup tests (36 cases) still green; manual end-to-end restore smoke test.

- [x] **Task 1.2 — CI pipeline** ✅ committed `2e15e4d`
  - **Objective:** Enforce all quality gates on every PR/push, not just locally.
  - **Outcome:** GitHub Actions workflow runs lint, typecheck, i18n parity, and `vitest run`.
  - **Files:** `.github/workflows/ci.yml` (~60).
  - **Dependencies:** None.
  - **Validation:** workflow runs green on a sample PR; fails when a lint/type/test error is
    intentionally introduced.

### Phase 2 — Should Fix Soon

**Dependencies:** Phase 1.

- [ ] **Task 2.1 — `dialog:pickImage` magic-byte validation + SVG rejection**
  - **Objective:** Make the logo uploader consistent with the document uploader (hardening, not a
    security blocker under this threat model).
  - **Outcome:** Image picker validates MIME by magic bytes (mirrors `documentIpc.ts`); SVG rejected
    or sanitized; allowed MIME list tightened.
  - **Files:** `src/main/ipc/dialogIpc.ts` (modify ~30 lines),
    `src/main/ipc/__tests__/dialogIpc.test.ts` (add ~40 lines).
  - **Dependencies:** None.
  - **Validation:** regression test rejecting an SVG payload and an extension-spoofed file; existing
    `dialogIpc` tests (3 cases) still pass.

- [ ] **Task 2.2 — Production logging hygiene**
  - **Objective:** Stop leaking full error objects to stdout in production.
  - **Outcome:** All `console.error` in `src/main` gated behind `isDev` or routed through a
    structured logger; `no-console` clean in prod build.
  - **Files:** affected IPC/service files (~15 files, ~45 sites — small per-file edits),
    optional `src/main/utils/logger.ts` (~60).
  - **Dependencies:** None.
  - **Validation:** `grep -rn "console.error" src/main` shows only `isDev`-guarded calls; lint clean.

- [ ] **Task 2.3 — Test coverage config + critical-flow E2E**
  - **Objective:** Enforce coverage on financial logic and add mandated E2E.
  - **Outcome:** Vitest `coverage` block with thresholds on `src/main/db` + `src/main/services`; new
    `e2e/financial.spec.ts` (record payment → ledger) and `e2e/backup.spec.ts` (backup → restore),
    both green in `ar-rtl` and `en-ltr`.
  - **Files:** `vitest.config.ts` (modify ~20 lines), `e2e/financial.spec.ts` (~120),
    `e2e/backup.spec.ts` (~120).
  - **Dependencies:** Task 1.1 (restore behavior must be stable before E2E exercises it).
  - **Validation:** `vitest run --coverage` meets thresholds; new E2E green in both directions.

- [ ] **Task 2.4 — Zod on read-side IPC handlers**
  - **Objective:** Make validation discipline uniform across reads.
  - **Outcome:** `dashboardIpc`, `exchangeRates:list`, `search:global` parse args through Zod
    (incl. `query` max-length cap).
  - **Files:** `src/main/ipc/dashboardIpc.ts`, `src/main/ipc/exchangeRateIpc.ts`,
    `src/main/ipc/searchIpc.ts` (~15 lines each), plus per-handler test additions (~30 lines each).
  - **Dependencies:** None.
  - **Validation:** malformed-payload tests throw `INVALID_INPUT`; existing dashboard/search tests
    green.

- [ ] **Task 2.5 — ESLint: enforce design-token + logical-CSS rules**
  - **Objective:** Make `eslint.config.mjs` match what ADR-002 (`docs/adr/002-…md:147`) claims.
  - **Outcome:** `no-restricted-syntax` entries banning raw hex literals, pixel values in `sx`, and
    physical CSS direction properties; surfaced violations fixed.
  - **Files:** `eslint.config.mjs` (modify ~25 lines), renderer fix-ups across components.
  - **Dependencies:** None (but expect a batch of lint fixes).
  - **Validation:** `npm run lint` clean; dual-direction E2E still green.

- [ ] **Task 2.6 — Packaging hardening**
  - **Objective:** Production-grade build artifacts.
  - **Outcome:** Code signing wired (CI secrets), `build/entitlements.mac.plist` created, auto-update
    URL real or removed, `sandbox:false` justified via ADR or resolved.
  - **Files:** `electron-builder.yml` (modify), `build/entitlements.mac.plist` (~20),
    `docs/adr/003-sandbox-and-signing.md` (~40).
  - **Dependencies:** Task 1.2 (CI hosts signing).
  - **Validation:** signed build produced in CI; referenced files exist; ADR present.

- [ ] **Task 2.7 — Documentation set**
  - **Objective:** Onboarding and deployment from docs alone.
  - **Outcome:** `README.md` (install/build/run), `docs/deployment.md` (packaging/signing/distribution),
    `docs/developer-onboarding.md`, `docs/IPC.md` (channel catalog).
  - **Files:** `README.md` (~150), `docs/deployment.md` (~120), `docs/developer-onboarding.md`
    (~100), `docs/IPC.md` (~200, generated or hand-written).
  - **Dependencies:** None.
  - **Validation:** a fresh clone builds and runs using only the README; IPC catalog covers all 115
    handlers.

- [ ] **Task 2.8 — MUI stabilization / ADR**
  - **Objective:** Resolve the `9.0.0-alpha.0` pre-release pin.
  - **Outcome:** Either pin to the first stable 9.x or record an ADR justifying the alpha.
  - **Files:** `package.json` (modify), `docs/adr/004-mui-version.md` (~40, if staying on alpha).
  - **Dependencies:** None.
  - **Validation:** `npm ls @mui/*` shows resolved version; ADR present if alpha retained; full test
    suite green after any bump.

### Phase 3 — Nice to Have

**Dependencies:** Phase 2.

- [ ] **Task 3.1 — Refactor >500-line files**
  - **Objective:** Bring `Reports.tsx` (534) and `recurringExpenseIpc.ts` (534) under the limit.
  - **Outcome:** Both under 500 lines; behavior unchanged.
  - **Files:** `src/renderer/pages/reports/Reports.tsx` + extracted sub-components,
    `src/main/ipc/recurringExpenseIpc.ts` + extracted schema module.
  - **Dependencies:** None.
  - **Validation:** `npm run lint` clean (max-lines); existing tests + E2E green.

- [ ] **Task 3.2 — Renderer de-duplication**
  - **Objective:** Remove copy-paste drift.
  - **Outcome:** Shared spinner-CSS util, `useFetch` hook, `useDirection` hook; call-sites migrated.
  - **Files:** `src/renderer/hooks/useFetch.ts` (~80), `src/renderer/hooks/useDirection.ts` (~20),
    `src/renderer/utils/numericInputSx.ts` (~20), ~20 call-site edits.
  - **Dependencies:** None.
  - **Validation:** existing unit + E2E green; visual parity in both directions.

- [ ] **Task 3.3 — i18n key fix**
  - **Objective:** Restore Arabic sidebar tooltips.
  - **Outcome:** `sidebar.expand` / `sidebar.collapse` present in `ar.json` and `en.json`.
  - **Files:** `src/renderer/locales/ar.json`, `src/renderer/locales/en.json`.
  - **Dependencies:** None.
  - **Validation:** `npm run check:i18n` green; visual check in Arabic.

- [ ] **Task 3.4 — RTL cleanups**
  - **Objective:** Remove the two flagged physical-CSS usages.
  - **Outcome:** `ReconstructBalanceCard.tsx:48` uses logical `textAlign: 'start'/'end'`;
    `Layout.tsx:332` Drawer anchor reviewed/justified.
  - **Files:** `src/renderer/components/ReconstructBalanceCard.tsx`, `src/renderer/components/Layout.tsx`.
  - **Dependencies:** None.
  - **Validation:** dual-direction E2E green; visual check.

- [ ] **Task 3.5 — Dashboard error state**
  - **Objective:** Surface total-dashboard-fetch failure to the user.
  - **Outcome:** Retry banner when all dashboard queries fail.
  - **Files:** `src/renderer/pages/dashboard/Dashboard.tsx` (modify ~20 lines).
  - **Dependencies:** None.
  - **Validation:** error-state unit/render test; manual network-failure check.

- [ ] **Task 3.6 — Ledger DB-level immutability**
  - **Objective:** Defense-in-depth against stray `UPDATE`/`DELETE` on ledger rows.
  - **Outcome:** `BEFORE UPDATE`/`DELETE` trigger raises `ABORT` on `ledger_entries`.
  - **Files:** `src/main/db/migrations/028_ledger_immutable_trigger.sql` (~15),
    `src/main/db/__tests__/ledgerService.test.ts` (add ~20 lines).
  - **Dependencies:** None.
  - **Validation:** test that a direct `UPDATE ledger_entries …` throws; existing ledger tests (17)
    green.

- [ ] **Task 3.7 — Component RTL tests + `AmountField` migration**
  - **Objective:** Catch portal RTL regressions at unit-test speed; remove the last
    `<TextField type="number">`.
  - **Outcome:** RTL render tests for `StandardDialog`/`ConfirmDialog`/`NotificationBell`;
    `RecurringExpenseForm` `day_of_month` uses `AmountField`.
  - **Files:** new `*.test.tsx` under `src/renderer/components/__tests__/`,
    `src/renderer/pages/expenses/RecurringExpenseForm.tsx`.
  - **Dependencies:** None.
  - **Validation:** new tests green in both directions; form submits correctly.

- [ ] **Task 3.8 — Theme shade adaptation**
  - **Objective:** Make `light`/`dark` palette shades actually differ by mode.
  - **Outcome:** `theme.ts:30,35,40,45,49,54` differentiated per mode.
  - **Files:** `src/renderer/theme/theme.ts`.
  - **Dependencies:** None.
  - **Validation:** visual check in light + dark, LTR + RTL.

---

## 5. Production Readiness Checklist

Legend: ✅ Completed · ⚠ Needs improvement · ❌ Missing · N/A Not applicable

| Criterion                       | Status | Notes                                                                                                     |
| ------------------------------- | :----: | --------------------------------------------------------------------------------------------------------- |
| Architecture & layer separation |   ✅   | UI→IPC→services→repos→DB clean                                                                            |
| Code quality / consistency      |   ⚠    | 2 files >500 lines; renderer duplication                                                                  |
| Functional completeness         |   ✅   | No TODOs/placeholders; flows correct                                                                      |
| UI / UX polish                  |   ⚠    | Mostly strong; a few RTL/i18n/numeric-field gaps                                                          |
| Performance                     |   ⚠    | Adequate; no budgets/profiles                                                                             |
| Authentication                  |   ✅   | Optional by design (single-user); `require_auth` defaults off — convenience lock, not a security boundary |
| Authorization / RBAC            |  N/A   | Single-user local app; RBAC out of scope                                                                  |
| Input validation (writes)       |   ✅   | Zod everywhere                                                                                            |
| Input validation (reads)        |   ⚠    | dashboard/search/exchangeRate gaps                                                                        |
| SQL injection safety            |   ✅   | 100% parameterized                                                                                        |
| XSS safety                      |   ⚠    | Document path safe; `pickImage` SVG (downgraded, Phase 2)                                                 |
| Secrets management              |   ✅   | bcrypt + safeStorage; none hardcoded                                                                      |
| File-upload security            |   ⚠    | Documents ✅; `pickImage` ⚠ (downgraded to Phase 2 under threat model)                                    |
| Database schema/constraints     |   ✅   | 27 migrations, FKs, CHECKs, indexes                                                                       |
| Ledger immutability             |   ⚠    | App-layer only (Task 3.6)                                                                                 |
| Backup strategy                 |   ⚠    | Restore reliability (B1)                                                                                  |
| IPC design                      |   ✅   | `domain:verb`, machine-readable errors                                                                    |
| IPC documentation               |   ❌   | No channel catalog                                                                                        |
| Reliability / crash handling    |   ❌   | No top-level handlers / crash reporting                                                                   |
| Unit tests (critical logic)     |   ✅   | Strong on financial/ledger/backup                                                                         |
| Coverage enforcement            |   ❌   | No config/threshold                                                                                       |
| E2E (critical flows)            |   ❌   | Smoke only                                                                                                |
| LTR/RTL E2E                     |   ⚠    | Smoke only; both directions exist                                                                         |
| CI/CD                           |   ❌   | No workflows (B2)                                                                                         |
| Code signing                    |   ❌   | Not configured                                                                                            |
| Auto-update                     |   ❌   | Placeholder URL                                                                                           |
| Dependencies (forbidden absent) |   ✅   | Clean stack                                                                                               |
| Dependencies (versions)         |   ⚠    | MUI alpha; adm-zip 0.x                                                                                    |
| README                          |   ❌   | Absent                                                                                                    |
| Install/deploy/onboarding docs  |   ❌   | Absent                                                                                                    |
| Pre-commit hooks                |   ✅   | husky + lint-staged + i18n + typecheck                                                                    |
| ESLint `max-lines` 500          |   ✅   | Enforced (`eslint.config.mjs:31`)                                                                         |
| TypeScript strict               |   ✅   | On via `@electron-toolkit/tsconfig`                                                                       |
| i18n key parity                 |   ✅   | Build-enforced                                                                                            |
| Design-token usage (colors)     |   ✅   | Hex confined to `theme.ts`                                                                                |

---

## 6. Final Verdict

- **Is it production-ready?** **Almost.** One must-fix reliability blocker remains.
- **If not, why not?**
  1. Backup restore overwrites the open DB and skips checksum on the legacy path (B1) — can destroy
     the user's own records. **The only true must-fix.**
  2. No CI/CD (B2) — quality gates are bypassable and unenforced on PRs.
  3. No README / install / deploy docs.
  - _Auth is intentionally optional (single-user app) and is NOT a blocker — see Threat Model._
- **Top five remaining tasks:** 1.1 (restore hardening), 1.2 (CI), 2.7 (README + docs),
  2.6 (packaging/signing), 2.3 (coverage + critical-flow E2E).
- **Estimated readiness:** ~78%. Reaches ~"Production Ready" after Task 1.1 + the key Phase 2 items
  (CI, docs, packaging, coverage/E2E, logging).
- **Estimated effort:** Phase 1 ≈ Medium (≈2–3 focused days — restore + CI); Phase 2 ≈ Medium–Large
  (≈1.5–2 weeks); Phase 3 ≈ Small–Medium (rolling). A realistic path to production: clear Task 1.1
  - Tasks 1.2/2.6/2.7 within ~1.5 focused weeks.

---

## Completion Checklist

- [ ] All Phase-1 blockers resolved and validated
- [ ] Repository rules (AGENTS.md / WORLD.md) respected by every change
- [ ] All unit + E2E tests passing in both LTR and RTL
- [ ] README + deployment + onboarding + IPC docs written
- [ ] CI pipeline green on `main`
- [ ] Signed production build produced
- [ ] No unguarded `console.error` in production main-process code
- [ ] Acceptance criteria for each task satisfied before its commit
- [ ] No unresolved blockers remain at sign-off
