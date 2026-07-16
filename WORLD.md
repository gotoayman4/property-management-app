# WORLD.md — Product Intent Guardrail

**Purpose:** Define what this project exists to do — and what it must NOT become. This file prevents AI (and humans) from adding features that violate the product vision.

**Source:** `SRS_Property_Management_App_EN.md` (canonical requirements)
**Last Updated:** 2026-07-16
**How AI uses this:** Before suggesting any feature, AI checks WORLD.md for guardrail violations. Features that cross NOT boundaries are rejected automatically.

---

## What This Project Is

This is a **Windows desktop application** for managing rented commercial stores and residential apartments. It is built for small-to-medium private property owners — typically one owner managing a portfolio of 10–200 rental units across one or more buildings. The application is installed locally on a single Windows PC; there is no server, no cloud sync, and no network dependency of any kind.

The core value proposition is replacing paper ledgers and scattered spreadsheets with a single, reliable Arabic-first system that tracks leases, collects rent, records payments, manages maintenance, and produces financial reports — all while working offline at all times. Every piece of data lives in a local SQLite database on the user's machine. The user owns their data completely.

The interface is **Arabic-first with full RTL layout**. English is fully supported as a secondary language. Every screen, label, error message, and report can be displayed in either language. No hardcoded text strings exist anywhere in the UI — all user-facing content goes through the i18n layer (`react-i18next`).

---

## Core Domains (What We Build)

- **Property & Unit Management** — Buildings, floors, commercial stores, residential apartments; unit types, area, amenities, and availability status
- **Tenant & Owner Management** — Tenant profiles, identification documents, emergency contacts, owner records, document expiry tracking and alerts
- **Contract Management** — Lease contracts (simple and multi-year with automatic annual escalation), contract renewal, termination, and archiving
- **Financial Ledger** — Immutable double-entry style ledger; rent posting, payment recording, receipt generation, balance tracking per unit
- **Recurring Expense Management** — Recurring costs (maintenance, utilities, insurance) linked to properties; automatic monthly posting
- **Security Deposit Management** — Deposit collection, holding tracking, partial/full refund with deduction itemization
- **Maintenance Request Management** — Request logging, priority triage, contractor assignment, cost tracking, status workflow
- **Invoice Generation** — Rent invoices, receipt generation, invoice history per tenant
- **Currency & Exchange Rate** — Multi-currency display (SAR, USD, EUR, YER); exchange rates stored locally; currency conversion is read-only display only — the ledger always records in the base currency
- **Reporting & Analytics** — Financial summaries, occupancy rates, rent collection reports, income/expense statements; export to Excel and HTML
- **Document Management** — Attach scanned documents (ID, contract, inspection reports) to tenants, properties, and contracts; MIME validation via magic bytes
- **Notifications & Alerts** — Contract expiry warnings, rent due reminders, document expiry alerts, maintenance overdue flags; all in-app, no email/SMS
- **Backup & Restore** — Manual and scheduled database backup to a user-chosen local folder; restore with integrity verification
- **Audit Trail** — Immutable log of all financial and data modifications; who changed what and when
- **User Authentication** — Local username/password login; optional SQLite database encryption; no cloud auth
- **Settings & Configuration** — Company branding, base currency, VAT settings, fiscal year start, notification thresholds
- **Dashboard & KPIs** — Occupancy rate, rent collection rate, outstanding balances, maintenance queue, upcoming expirations — all on a home dashboard

---

## What This Project Is NOT (Guardrails)

These are the boundaries. AI must not suggest features that cross these lines.

### NOT: A Cloud or Network Application
- No cloud database (Firebase, Supabase, PostgreSQL on a server, MongoDB Atlas)
- No REST API server, no GraphQL server, no NestJS backend, no Express server
- No WebSockets, no real-time sync, no live collaboration
- No cloud storage for documents (no S3, no Firebase Storage, no OneDrive API)
- No network-dependent features of any kind — the app MUST work with no internet connection
- No SaaS subscription model, no multi-tenant cloud architecture

### NOT: A Mobile Application
- No React Native, no Expo, no Capacitor, no Ionic
- No mobile-first or touch-first design decisions
- No responsive layout for screens smaller than 1280px — this is a desktop app
- No PWA, no service workers

### NOT: A Multi-User or Enterprise System
- No role-based cloud access control (RBAC with server enforcement)
- No concurrent multi-user editing (SQLite is single-writer by design)
- No Active Directory / LDAP / SSO integration
- No audit sharing or collaborative workflow between multiple offices

### NOT: A Full Accounting System
- No general ledger beyond property income/expense
- No payroll, no tax filing, no VAT return submission to government APIs
- No accounts payable / accounts receivable beyond rent and security deposits
- No inventory management
- Currency conversion is **display-only** — never modifies ledger amounts

---

## Explicitly Out-of-Scope Features

These features have been specifically considered and rejected. AI must not re-propose them.

| Feature | Reason for Rejection | Date Decided |
|---|---|---|
| Cloud sync / remote database | Contradicts offline-first architecture; adds security surface | 2026-07-16 |
| Mobile app (iOS / Android) | Windows desktop only; different UX paradigm; out of scope for v1 | 2026-07-16 |
| Tenant-facing portal (web) | Adds web server requirement; violates offline-first constraint | 2026-07-16 |
| Government e-invoicing API integration (Fatoorah, ZATCA) | External network dependency; regulatory complexity; future roadmap only | 2026-07-16 |
| Email / SMS notifications | Requires network; SMTP server config; out of scope for v1 | 2026-07-16 |
| Online payment collection (PayTabs, HyperPay) | Requires payment gateway API and internet; not offline-first | 2026-07-16 |
| WhatsApp / Telegram messaging | External service dependency; not offline-first | 2026-07-16 |
| Utility billing integration (electricity/water APIs) | External dependency; country-specific; future roadmap only | 2026-07-16 |
| Predictive analytics / AI rent pricing | Requires cloud ML; out of scope for a local desktop tool | 2026-07-16 |
| Multi-company / franchise management | Multi-tenant architecture; contradicts single-install model | 2026-07-16 |
| Blockchain-based contract signing | No practical value for target users; tech complexity | 2026-07-16 |

---

## Target Users

| Role | Description | Primary Needs |
|---|---|---|
| **Property Owner** | Non-technical individual who owns 10–200 rental units; primary decision-maker; uses the app directly | Dashboard KPIs, financial summary, tenant overview, quick rent collection status |
| **Property Manager** | Day-to-day operator; may or may not be the owner; manages contracts, maintenance, and tenant communication | Tenant records, contract management, maintenance requests, invoice generation, payment recording |
| **Accountant / Finance Officer** | Tracks income and expenses; produces reports for the owner | Ledger entries, payment history, recurring expenses, financial reports, Excel/HTML export |

---

## Non-Functional Priorities (Ranked)

1. **Data integrity** — No data loss under any circumstances. All financial writes are atomic (`better-sqlite3` transactions). Ledger entries are immutable; corrections use reversal entries only. Backup is always available.
2. **Offline availability** — 100% of all features work with zero internet connection. No feature may depend on a network request.
3. **Bilingual RTL/LTR** — Arabic-first layout (RTL), full English support (LTR). Direction toggle must be instant with zero first-paint flicker. All text via `react-i18next`.
4. **Performance on minimum hardware** — The app must run smoothly on Intel Core i3 / 8 GB RAM / Windows 10 (SRS NFR-PERF-01). No operations may block the UI thread for more than 100ms.
5. **Security** — Local authentication, optional SQLite encryption, MIME magic-byte file validation. No plaintext credential storage.
6. **Accessibility** — WCAG 2.1 AA for both RTL and LTR layouts. Keyboard navigation for all core workflows.
7. **Maintainability** — TypeScript strict mode, ESLint, Vitest coverage on all financial logic, Playwright E2E for critical flows.

---

## Scale Expectations

| Metric | Launch | 12-Month Projection | 24-Month Projection |
|---|---|---|---|
| Users per install | 1 (single-user) | 1–3 (owner + staff on same PC) | 1–3 |
| Properties per install | 1–5 | 1–10 | 1–20 |
| Units per install | 10–100 | 10–200 | 10–500 |
| Tenants per install | 10–200 | 10–500 | 10–1,000 |
| Ledger entries per install | 500–5,000/year | 1,000–20,000/year | up to 50,000/year |
| Concurrent users | 1 (SQLite single-writer) | 1 | 1 |

SQLite handles these volumes with ease. No sharding, partitioning, or caching strategy is needed for the foreseeable future.

---

## Technology Constraints (Non-Negotiable)

- **Desktop shell:** Electron 43.x — no Tauri, no NW.js, no other desktop shell
- **Database:** SQLite via `better-sqlite3` 12.x — no cloud DB, no PostgreSQL, no MongoDB
- **Frontend:** React 19 + TypeScript 5 — no Vue, no Angular, no plain JS
- **UI library:** MUI 9 (Core + MUI X) — no Tailwind, no shadcn, no Bootstrap. All patterns follow `_guidelines/06-frontend-patterns/`
- **RTL:** `stylis-plugin-rtl` + MUI theme direction — no manual `margin-left`/`margin-right` overrides
- **i18n:** `react-i18next` — no hardcoded strings anywhere in the UI (Arabic or English)
- **Forms:** React Hook Form 7.x + Zod 4.x — no `useState` per field, no custom validation libraries
- **Styling:** MUI `theme.palette.*` design tokens exclusively — no raw hex colors, no inline styles, no `!important`
- **File validation:** `file-type@16.5.4` for MIME magic-byte inspection on all document uploads
- **Build:** `electron-vite` 5.x — no Create React App, no Webpack directly

---

## Security Model & Trust Boundaries

- **Authentication:** Local username/password stored as bcrypt hash in SQLite. No JWT, no session tokens sent over network (there is no network).
- **Authorization:** Single-user app. No RBAC required. Future multi-staff access is in-process only (same PC, same OS user account).
- **Database encryption:** Optional SQLite encryption via `better-sqlite3-sqlcipher` — user sets a passphrase at first run. If enabled, the DB file is encrypted at rest.
- **File Upload MIME Validation:** ALL document attachments (ID scans, contracts, inspection photos) MUST be validated via `file-type@16.5.4` magic-byte inspection. Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`. Reject all others regardless of file extension.
- **IPC Security:** Electron context isolation is ON. `nodeIntegration` is OFF. All main-process operations go through typed IPC handlers with input validation.
- **No CORS:** This is a desktop app. There is no web server, no CORS surface.

---

## Data Freshness Policy

This app has no network state. There is no SWR, React Query, or any server-state caching layer.

- **All data reads** go directly to SQLite via IPC (`invoke('db:query', ...)`) — always fresh, always synchronous from the DB perspective.
- **After any write**, the calling component re-fetches its data slice via the same IPC channel.
- **No stale-while-revalidate** strategy is needed — the database is local and reads are sub-millisecond.
- **Cache keys (for in-memory UI state only):** Use Zustand stores if cross-component state sharing is needed. Key by entity type + ID.

---

## Maintenance

- **When:** Update WORLD.md when product scope changes, new out-of-scope decisions are made, or scale expectations change.
- **Who:** Product owner or lead developer. Not AI.
- **Review:** Quarterly alongside guideline review.
- **How AI uses this:** Before suggesting any feature, AI checks WORLD.md for guardrail violations. Features that cross NOT boundaries are rejected automatically.

---

**Cross-References:**
- Canonical requirements: `SRS_Property_Management_App_EN.md`
- Project constitution: `AGENTS.md`
- Document navigation: `ARCHITECTURE_INDEX.md`
- Bidirectional design principles: `_guidelines/02-engineering-practices/bidirectional-design-principles.md`
- Frontend patterns: `_guidelines/06-frontend-patterns/`
