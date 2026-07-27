# PropManager — Property Management Desktop App

Offline, single-user property management application built with Electron + React + TypeScript + SQLite.

## Features

- **Properties:** CRUD with auto-generated codes, country/currency, status tracking
- **Tenants:** Individual/company profiles, multi-language, emergency contacts
- **Contracts:** Active lifecycle (draft → active → expired/terminated), rent escalation schedules
- **Payments:** Record, void, receipt generation, covered-period tracking
- **Expenses:** Category management, void support, recurring expense templates
- **Financial Ledger:** Running balance, manual adjustments, Excel export, multi-currency consolidation
- **Reports:** Per-currency income/expense, consolidated summaries, HTML/Excel export
- **Backup & Restore:** ZIP archives with documents, database-only backups, integrity verification
- **Search:** Global search across all entities
- **Notifications:** Template-based, auto-evaluated alerts
- **Bilingual:** Full Arabic (RTL) + English (LTR) support with instant direction toggle

## Prerequisites

- **Node.js** 22+ (LTS recommended)
- **npm** 10+
- **Windows build tools** (for native modules: `npm install -g windows-build-tools` or use Visual Studio Build Tools)

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd property-management-app

# Install dependencies
npm install

# Start development mode (hot reload)
npm run dev

# Build for production
npm run build

# Preview the built app
npm run preview
```

## Available Scripts

| Command              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `npm run dev`        | Start Electron + Vite dev server with hot reload                |
| `npm run build`      | Production build (Electron packager)                            |
| `npm run preview`    | Preview the built app locally                                   |
| `npm run lint`       | ESLint (TypeScript rules)                                       |
| `npm run type-check` | TypeScript strict mode check (`tsc --noEmit`)                   |
| `npm test`           | Vitest unit tests                                               |
| `npm run test:e2e`   | Playwright E2E tests (builds first, then runs both RTL and LTR) |
| `npm run check:i18n` | Verify Arabic/English translation key parity                    |

## Tech Stack

| Layer         | Technology                            |
| ------------- | ------------------------------------- |
| Desktop shell | Electron 43                           |
| Frontend      | React 19 + TypeScript 5 (strict)      |
| Build         | electron-vite 5                       |
| UI            | MUI Core + MUI X 9                    |
| Forms         | React Hook Form 7 + Zod 4             |
| i18n          | react-i18next                         |
| Database      | better-sqlite3 12 (main process only) |
| Router        | React Router 7 (createBrowserRouter)  |
| State (UI)    | Zustand                               |
| Testing       | Vitest + Playwright                   |
| Logging       | electron-log 5                        |
| Pre-commit    | husky + lint-staged                   |

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── ipc/                 # IPC handlers (one file per domain)
│   ├── db/                  # SQLite schema, migrations, repositories
│   ├── services/            # Business logic (backup, reports, exports)
│   └── utils/               # Logger, helpers
├── renderer/                # React UI
│   ├── components/          # Shared components (StandardTable, PageHeader, etc.)
│   ├── pages/               # Route pages (properties, tenants, payments, etc.)
│   ├── hooks/               # Custom hooks
│   ├── stores/              # Zustand stores
│   ├── locales/             # ar.json + en.json translation files
│   └── utils/               # Error messages, helpers
└── preload/                 # Preload bridge (window.api)
e2e/                         # Playwright E2E tests
docs/
├── adr/                     # Architecture Decision Records
└── plans/                   # Implementation plans
```

## Architecture

- **IPC-first:** All database access goes through typed IPC handlers in the main process. The renderer never touches SQLite directly.
- **Zod validation:** Every IPC handler validates input with Zod schemas at the boundary.
- **Atomic writes:** Financial operations use `db.transaction()` for atomicity. Ledger entries are immutable.
- **Magic-byte file validation:** File uploads verified via `file-type@16.5.4` — never trust extensions.
- **Logging:** Centralized `electron-log` — file transport in production, console in dev.

## License

Private — All rights reserved.
