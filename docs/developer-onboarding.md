# Developer Onboarding Guide

## First-Time Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd property-management-app

# 2. Install dependencies (includes postinstall hooks for husky)
npm install

# 3. Verify everything works
npm run type-check    # Should produce 0 errors
npm run lint          # Should produce 0 errors (warnings are OK)
npm test              # All tests should pass
```

## Development Workflow

```bash
npm run dev           # Start dev mode (Electron + Vite hot reload)
```

Changes to `src/renderer/` hot-reload instantly. Changes to `src/main/` restart Electron.

## Pre-Commit Hooks

Every commit runs automatically via husky + lint-staged:

1. **ESLint** — lint staged files
2. **TypeScript** — type-check the project
3. **i18n parity** — verify `src/locales/ar.json` and `en.json` have the same keys

If any step fails, the commit is blocked. Fix the issues and try again.

## Key Conventions

### IPC Handlers

All IPC handlers live in `src/main/ipc/<domain>Ipc.ts`. Each handler:

1. Validates input with Zod at the boundary
2. Delegates to repository/service functions
3. Returns results or throws machine-readable error codes
4. Never exposes stack traces to the renderer

Channel naming: `domain:verb` (e.g., `tenants:getAll`, `payments:record`).

### Shared Components

| Component                          | Use for                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `StandardTable`                    | All list pages (properties, tenants, payments, ledger) |
| `StandardDialog`                   | All modals (create, edit, confirm)                     |
| `PageHeader`                       | Page titles with icon + action button                  |
| `CurrencyInput`                    | All monetary fields                                    |
| `GlobalSnackbar` + `useSnackbar()` | All user feedback messages                             |

### i18n

All user-visible strings use `t('namespace.key')`. Translation files:

- `src/locales/ar.json` — Arabic (primary)
- `src/locales/en.json` — English

When adding a new key, add it to **both** files. The pre-commit hook enforces parity.

### RTL/Bilingual

- Use logical CSS properties: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`
- Never use physical direction properties: `ml-*`, `pl-*`, `left-*`, `right-*`
- All portal components (Dialog, Popover) need explicit `dir` prop
- Arabic text: line-height 1.6–1.8, font-weight ≥ 400, no letter-spacing

### Database

- All DB access in main process via `better-sqlite3`
- Never import `better-sqlite3` in renderer code
- Financial writes must use `db.transaction()` for atomicity
- Ledger entries are immutable — corrections use reversal entries

## Testing

```bash
npm test                    # Unit tests (Vitest)
npm test -- --coverage      # With coverage report
npm run test:e2e            # E2E tests (Playwright, builds first)
```

### Unit tests

- Main process tests: `src/main/**/*.test.ts` (Node environment)
- Renderer tests: `src/renderer/**/*.test.ts` (jsdom environment)
- Auth tests run in separate Vitest project (bcrypt/better-sqlite3 isolation)

### E2E tests

- Located in `e2e/` directory
- Run against the built app (`npm run build` first)
- Two projects: `ar-rtl` and `en-ltr` (dual-direction coverage)

## Architecture Decision Records

ADRs are in `docs/adr/`. Key decisions documented:

- **ADR-001:** Online exchange rate fetch exception (user-initiated only)
- **ADR-002:** Schema and feature drift from SRS
- **ADR-003:** Packaging and distribution strategy (unsigned, Inno Setup, no auto-update)
