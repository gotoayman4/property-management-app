# ARCHITECTURE_INDEX.md — Document Navigation Index

**Purpose:** Single entry point for finding key architectural, technical, and requirements documents. Gives both humans and AI agents a fast way to locate any document.

**Last Updated:** 2026-07-16

---

## Quick Links

| Document | Location | Content |
|---|---|---|
| **Project Constitution** | [`AGENTS.md`](./AGENTS.md) | Non-negotiable rules for all AI agents — stack, patterns, forbidden patterns |
| **Product Intent Guardrail** | [`WORLD.md`](./WORLD.md) | What this project is / is NOT — guardrails against scope creep |
| **Requirements (SRS)** | [`SRS_Property_Management_App_EN.md`](./SRS_Property_Management_App_EN.md) | Canonical system requirements — all 17 modules, NFRs, data model |
| **Dev Tools Reference** | [`DEVTOOLS.md`](./DEVTOOLS.md) | AI tool config directory inventory and `.gitignore` patterns |
| **Global Guidelines** | [`_guidelines/`](./_guidelines/) | Engineering, architecture, and design guidelines mirrored from global repo |
| **Guidelines Master Index** | [`_guidelines/_index/MASTER_INDEX.md`](./_guidelines/_index/MASTER_INDEX.md) | Navigation index for all guideline files |
| **Agent Boot Protocol** | [`_guidelines/_index/AGENT_BOOT_PROTOCOL.md`](./_guidelines/_index/AGENT_BOOT_PROTOCOL.md) | AI initialization procedure — what to read first |

---

## Guideline Quick Reference

| Category | Guideline File | When to Load |
|---|---|---|
| RTL / Arabic architecture | [`_guidelines/05-stack-guides/rtl-tech-stack.md`](./_guidelines/05-stack-guides/rtl-tech-stack.md) | All UI work |
| MUI RTL setup | [`_guidelines/05-stack-guides/mui/mui-rtl-bidirectional.md`](./_guidelines/05-stack-guides/mui/mui-rtl-bidirectional.md) | MUI theme / direction toggle |
| Table patterns | [`_guidelines/06-frontend-patterns/table-patterns.md`](./_guidelines/06-frontend-patterns/table-patterns.md) | Any list/data view |
| Form patterns | [`_guidelines/06-frontend-patterns/form-patterns.md`](./_guidelines/06-frontend-patterns/form-patterns.md) | Any create/edit form |
| Dialog patterns | [`_guidelines/06-frontend-patterns/dialog-patterns.md`](./_guidelines/06-frontend-patterns/dialog-patterns.md) | Any modal/dialog |
| Notification patterns | [`_guidelines/06-frontend-patterns/notification-patterns.md`](./_guidelines/06-frontend-patterns/notification-patterns.md) | Success/error feedback |
| Loading & empty states | [`_guidelines/06-frontend-patterns/loading-and-empty-states.md`](./_guidelines/06-frontend-patterns/loading-and-empty-states.md) | Any data-dependent view |
| Visual design principles | [`_guidelines/06-frontend-patterns/visual-design-principles.md`](./_guidelines/06-frontend-patterns/visual-design-principles.md) | UI polish, spacing, color |
| React architecture | [`_guidelines/05-stack-guides/react/react-architecture.md`](./_guidelines/05-stack-guides/react/react-architecture.md) | Component structure |
| Security engineering | [`_guidelines/02-engineering-practices/security-engineering.md`](./_guidelines/02-engineering-practices/security-engineering.md) | IPC, file upload, auth |
| Error handling | [`_guidelines/02-engineering-practices/error-handling-philosophy.md`](./_guidelines/02-engineering-practices/error-handling-philosophy.md) | Try/catch patterns, IPC errors |
| Testing philosophy | [`_guidelines/02-engineering-practices/testing-philosophy.md`](./_guidelines/02-engineering-practices/testing-philosophy.md) | Vitest + Playwright |
| Bidirectional design | [`_guidelines/02-engineering-practices/bidirectional-design-principles.md`](./_guidelines/02-engineering-practices/bidirectional-design-principles.md) | RTL/LTR layout decisions |
| Git workflow | [`_guidelines/03-git-and-ci/git-workflow-strategy.md`](./_guidelines/03-git-and-ci/git-workflow-strategy.md) | Commit conventions, branching |

---

## Module Map (SRS §5 — Functional Requirements)

| Module # | Module Name | SRS Section | Primary Service File (planned) |
|---|---|---|---|
| M-01 | Property & Unit Management | SRS §5.1 | `src/services/propertyService.ts` |
| M-02 | Tenant & Owner Management | SRS §5.2 | `src/services/tenantService.ts` |
| M-03 | Contract Management | SRS §5.3 | `src/services/contractService.ts` |
| M-04 | Financial Ledger | SRS §5.4 | `src/services/ledgerService.ts` |
| M-05 | Recurring Expense Management | SRS §5.5 | `src/services/expenseService.ts` |
| M-06 | Security Deposit Management | SRS §5.6 | `src/services/depositService.ts` |
| M-07 | Maintenance Request Management | SRS §5.7 | `src/services/maintenanceService.ts` |
| M-08 | Invoice Generation | SRS §5.8 | `src/services/invoiceService.ts` |
| M-09 | Currency & Exchange Rate | SRS §5.9 | `src/services/currencyService.ts` |
| M-10 | Reporting & Analytics | SRS §5.10 | `src/services/reportService.ts` |
| M-11 | Document Management | SRS §5.11 | `src/services/documentService.ts` |
| M-12 | Notifications & Alerts | SRS §5.12 | `src/services/notificationService.ts` |
| M-13 | Backup & Restore | SRS §5.13 | `src/services/backupService.ts` |
| M-14 | Audit Trail | SRS §5.14 | `src/services/auditService.ts` |
| M-15 | User Authentication | SRS §5.15 | `src/services/authService.ts` |
| M-16 | Settings & Configuration | SRS §5.16 | `src/services/settingsService.ts` |
| M-17 | Dashboard & KPIs | SRS §5.17 | `src/services/dashboardService.ts` |

---

## How to Change Something Safely

- **Adding a new UI list page:** Read `table-patterns.md` + copy an existing list page. Use `StandardTable`, not raw MUI `<Table>`.
- **Adding a new form / create flow:** Read `form-patterns.md` + `dialog-patterns.md`. Use `StandardDialog` + React Hook Form + Zod schema. Wire unsaved-changes protection.
- **Modifying financial logic (ledger, payments, deposits):** Read SRS §5.4 (Financial Ledger). Wrap ALL writes in `db.transaction()`. Never delete or update existing ledger rows — use reversal entries.
- **Adding a new IPC channel:** Define the Zod schema first, then the IPC handler in `src/main/ipc/`. Follow `domain:verb` naming convention. Expose via `contextBridge` in preload.
- **Changing RTL / LTR behaviour:** Read `rtl-tech-stack.md` + `mui-rtl-bidirectional.md`. Change theme direction and Emotion cache together with `i18n.changeLanguage()`. Test both directions before committing.
- **Adding a new document attachment type:** Read `_guidelines/02-engineering-practices/file-upload-security.md`. Add MIME type to the whitelist in the main-process upload handler. Validate via `file-type@16.5.4`.
- **Adding a new report:** Read SRS §5.10. Reports must export to both Excel (`exceljs`) and HTML. Use `theme.palette.*` tokens for HTML report styling.
- **Changing the database schema:** Create a new migration script in `src/main/db/migrations/`. Never mutate existing migration files. Test migration on a copy of a real database.
- **Modifying backup / restore:** Read SRS §5.13. Backup must be user-triggered (manual) and scheduled. Restore must verify database integrity before replacing the live file.

---

## Planned Source Tree (Top-Level)

```
src/
  main/               # Electron main process (Node.js)
    ipc/              # IPC handlers (one file per domain)
    db/               # SQLite setup, migrations, better-sqlite3 instance
    services/         # Business logic (called by IPC handlers)
  preload/            # contextBridge API exposure
  renderer/           # React frontend (Vite)
    components/       # Shared UI components (StandardTable, StandardDialog, etc.)
    pages/            # One folder per module (properties/, tenants/, contracts/, ...)
    hooks/            # Custom React hooks
    services/         # Frontend-side data helpers (IPC call wrappers)
    locales/          # ar.json, en.json
    theme/            # MUI theme, Emotion caches (LTR + RTL)
    constants/        # Enums, IPC channel names, config constants
    types/            # Shared TypeScript interfaces
    utils/            # Pure utility functions (formatters, validators, etc.)
src-tauri/            # (Not used — Electron only)
_guidelines/          # Mirrored global guidelines (run sync-guidelines.ps1)
.agents/              # Project-specific AI skills
```

---

## Maintenance

Update this index whenever:
- A new major document is created
- A document is moved or renamed
- A new module or subsystem is added
- A guideline file that this project depends on is changed in the global guidelines repo
