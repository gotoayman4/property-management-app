# AGENTS.md — Project Constitution

**Purpose:** This file contains ALL extracted rules inline — no external file references.
The rules are self-contained and work in any AI tool without permission issues.
For deeper context, a `_guidelines/` mirror is available in this project (run `sync-guidelines.ps1` to create/refresh it).

**Guideline source:** `D:\WebApps\global-guidelines-for-a-vibe-coder`
**How to use:** Search for `[FILL]` and replace with project-specific values.

---

## Security (Always Load — DO NOT REMOVE)

### SQL Injection Prevention

ALL database queries MUST use parameterized statements. NEVER concatenate strings into SQL.
→ Source: `02-engineering-practices/security-engineering.md`

### Secrets Management

NEVER hardcode secrets, tokens, API keys, or credentials in source files. Environment variables only. Pre-commit hooks MUST scan for secret patterns.
→ Source: `03-git-and-ci/environment-management.md`

### Input Validation

ALL user input MUST be validated at system boundaries (API controllers, DTOs). Use class-validator + ValidationPipe. Trust no client-side validation.
→ Source: `02-engineering-practices/error-handling-philosophy.md`

### Authentication Code Review

Authentication code MUST receive 100% human review. No exceptions.
→ Source: `02-engineering-practices/security-engineering.md`

### Dependency Audit

Dependencies MUST be audited on every AI PR. Verify package existence, latest stable version, and known vulnerabilities. AI hallucinates package names and suggests stale versions — training data is inherently outdated. Search the web or npm registry for the current latest stable version before installing any package. Never accept "AI version X is latest" — verify. Pin to older versions only when documented in an ADR (compatibility, RTL regression, undocumented breaking changes, ecosystem lag).
→ Source: `00-ai-fundamentals/ai-security-governance.md`

### CORS

NEVER use `origin: '*'`. Configure an explicit CORS whitelist from day one.
→ Source: `00-ai-fundamentals/ai-security-governance.md`

### Security Headers

Security headers (CSP, HSTS, X-Frame-Options) MUST be configured. They are mandatory, not optional.
→ Source: `02-engineering-practices/security-engineering.md`

### File Upload MIME Validation (Magic-Byte)

ALL file upload endpoints MUST verify MIME type by reading magic bytes from the file buffer, not by trusting client-supplied `Content-Type` headers. Use `file-type` package (CommonJS-compatible version, `file-type@16.5.4` for Node.js). Reject uploads whose detected MIME type does not match the allowed whitelist.
→ Source: `02-engineering-practices/file-upload-security.md`

---

## Testing (Always Load)

### Regression Tests for Bug Fixes

Every bug fix MUST include a regression test that reproduces the bug and verifies the fix.
→ Source: `02-engineering-practices/testing-patterns.md`

### Tests for Critical and High-Risk Code

New code that touches critical flows (auth, payments, permissions, data persistence, core workflows) MUST include corresponding tests. Code at service boundaries (API contracts, database queries, form validation) SHOULD include integration tests. Simple UI rendering, pass-through code, and experimental prototypes MAY skip tests. Optimize for regression risk, not coverage percentage.
→ Source: `02-engineering-practices/testing-philosophy.md`

### Tests Before or With Code, Not After

For critical and high-risk features, write behavioral tests first based on requirements/PRD (test-first). For all other code, write tests in the same iteration as implementation. NEVER defer tests to a later sprint — tests written after features mirror bugs instead of defining correct behavior.
→ Source: `02-engineering-practices/testing-philosophy.md`

### Critical Flow E2E Coverage

Critical workflow chains MUST have E2E coverage covering both happy path and failure path.
→ Source: `02-engineering-practices/testing-patterns.md`

### Test Behavior, Not Implementation

Tests MUST verify behavior (what the code does), not implementation (how it does it). Do not test internal function calls, state shape, or private methods.
→ Source: `02-engineering-practices/testing-philosophy.md`

### No Code Without Test Verification

Every line of AI-generated code is unverified until tests pass. "It compiled, so it works" is false.
→ Source: `00-ai-fundamentals/ai-collaboration-mindset.md`

### Normalization Functions Require Exhaustive Tests

Every normalization/mapping function (e.g., role code normalization, enum mapping) MUST have exhaustive parameterized tests covering: every valid input, every deprecated alias, empty/whitespace/invalid inputs, and case variations. Use `it.each()` or equivalent for exhaustive coverage.
→ Source: `02-engineering-practices/testing-patterns.md`

### Pre-Commit Hooks Mandatory

Every project MUST have pre-commit hooks (husky + lint-staged) running: ESLint, TypeScript type-check, and formatting. Hooks MUST be configured in `package.json` and installed automatically after `npm install`. No commits without passing hooks.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

---

## Git (Load for All Code Changes)

### Commit After Every Working Increment

Commit after every working increment. Granular commits = cheap rollbacks. NEVER commit broken code "to save progress" — use stash or WIP branches.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

### Descriptive Commit Messages

Commit messages MUST be descriptive with type and scope (conventional commit format). Future you and future AI need the context.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

### Revert Broken AI Output Immediately

Do not debug-in-place. Revert broken AI output immediately and regenerate with better constraints.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

### Checkpoint Before Major AI Operations

Always create a checkpoint (commit or branch) before running major AI operations. Always have a rollback point.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

### Protect Main Branch

Main branch MUST always be deployable. Use branch protection rules. Agents should never force-push to main.
→ Source: `03-git-and-ci/git-workflow-strategy.md`

---

## Architecture (Load for New Features)

### File Size Limit

Files MUST NOT exceed 500 lines (plan for 300). Any file exceeding 500 lines after implementation MUST be refactored into smaller modules before proceeding. Enforced by ESLint `max-lines` rule. Only applies to source code — documentation, config, and generated files are excluded.
→ Source: `02-engineering-practices/file-organization.md`

### Layer Separation

NEVER put business logic in UI components. API calls, data transformations, and state management belong in services/hooks layers, not in JSX.
→ Source: `04-architecture/backend-architecture.md`

### Pagination for Lists

Every list endpoint MUST support pagination. No exceptions for lists that could exceed 50 items.
→ Source: `04-architecture/api-design-standards.md`

### AI-Readable Code Documentation

Code comments in this project serve the NEXT AI session, not human readers. Use the ICDC framework:

- **INTENT:** What is this code supposed to do? (always for non-trivial functions)
- **CONSTRAINT:** What must this code NOT violate? (security, business rules, performance)
- **DECISION:** Why was this approach chosen over alternatives? (when non-obvious)
- **CAVEAT:** What edge cases or surprising behaviors exist? (when behavior may surprise)
  Every file MUST start with a file-level comment providing context for an AI agent seeing it for the first time. Every exported function MUST have JSDoc/TSDoc with what it does, parameters, return value, and side effects. NEVER restate what the code does — comments add CONTEXT the code itself cannot express.
  → Source: `02-engineering-practices/ai-code-documentation.md`

### One Source of Truth Per State Type

Server state in data-fetching library (React Query / SWR). Form state in form library. NEVER duplicate state across stores.
→ Source: `04-architecture/state-management.md`

### Error Responses with Machine-Readable Codes

Error responses MUST include a machine-readable `code` field. NEVER expose stack traces in API responses.
→ Source: `04-architecture/api-design-standards.md`

### Vertical Slice Development

Build one complete feature from UI → API → Database before starting the next. Never build by horizontal layers (all models first, then all routes, then all pages). The first increment must be a fully working end-to-end feature, however thin.
→ Source: `01-workflow-methodology/development-workflow.md`

### SWR / React Query Key Convention — Raw Tuples Only

ALL data-fetching query keys, mutations, and cache invalidations MUST use a consistent raw tuple format: `['entity', params] as const`. NEVER use stringified JSON keys, path strings, or loose arrays. This enables reliable wildcard cache invalidations. Centralize key constants in a shared file (e.g., `src/constants/swrKeys.ts` or `src/constants/queryKeys.ts`).
→ Source: `04-architecture/state-management.md`

### Router API — Data Router Only

Use the framework's data router API exclusively. For React Router: `createBrowserRouter`, never `<BrowserRouter>`. The data router API is required for native `useBlocker`, `useNavigation`, loaders, and actions. Custom navigation-blocking workarounds are forbidden — use the framework's native blocker instead.
→ Source: `04-architecture/router-architecture.md`

### Batch Fetch Parallelism Cap

When fetching paginated data across multiple pages concurrently, cap parallelism at 4 simultaneous requests. Never fire unbounded concurrent requests. Extract a shared utility (e.g., `fetchAllPages<T>()`) for reuse.
→ Source: `02-engineering-practices/performance-optimization.md`

### Import Hygiene ESLint Rules

ESLint MUST enforce: `import-x/no-duplicates` (no duplicate imports from same package) and `import-x/order` (consistent import ordering). Use inline `type` keyword for type-only imports from the same package: `import { foo, type Bar } from 'module'`. Fix violations immediately.
→ Source: `02-engineering-practices/file-organization.md`

### Code Duplication Detection

AI MUST proactively detect and flag duplicated logic across files during every session. When the same mapping, validation, or transformation logic appears in 2+ files, extract to a shared utility immediately. Do not wait for a refactoring pass — deduplicate in the same iteration.
→ Source: `02-engineering-practices/code-duplication-prevention.md`

---

## Design & UX (Load for UI Work)

### Apply Interaction Design Heuristics

Every UI decision MUST align with Nielsen's 10 Usability Heuristics. Before shipping any interface: (1) every action produces visible feedback (no silent operations), (2) prevent errors before handling them (validate early, constrain inputs), (3) don't make users remember — show options, labels, and state persistently, (4) always provide an escape (Cancel/Undo on every dialog and destructive action), (5) speak the user's language — never expose internal jargon or error codes in the UI.
→ Source: `02-engineering-practices/ux-design-principles.md`

### Handle All Four States

Every data-dependent component MUST handle: loading, error, empty, and success states. No component renders without handling all four.
→ Source: `06-frontend-patterns/loading-and-empty-states.md`

### Visual Consistency Through Design Tokens

All styling MUST use design tokens (theme.palette or CSS custom properties). Never raw hex colors, pixel values, or font families in components. Enforce via linting.
→ Source: `06-frontend-patterns/visual-design-principles.md`

### Shared Components Over Raw Primitives

Use application shared components (StandardTable, PageHeader, StandardDialog) over raw library primitives. Every shared component handles all four states and is tested in both RTL and LTR.
→ Source: `04-architecture/frontend-architecture.md`

### Visual Hierarchy and Spacing

High contrast for important elements (CTAs, errors), low contrast for structural elements. All spacing and sizing follows an 8px-based mathematical scale. Maximum 2 typefaces. Body text 16px+. Never convey information through color alone — always pair with text, icons, or patterns.
→ Source: `06-frontend-patterns/visual-design-principles.md`

### Incremental Adoption for Existing Projects

Design system adoption MUST NOT block feature development. New features use design system components exclusively. Existing code migrates when touched for other reasons (Strangler Fig pattern). Track adoption metrics; set quarterly improvement targets.
→ Source: `08-governance/design-system-governance.md`

---

## AI Collaboration (Load for Every Session)

### AI Output is Draft, Not Final

First AI output is ALWAYS a draft. Treat as draft. Iterate at least once. Accepting first output without review is an anti-pattern.
→ Source: `00-ai-fundamentals/ai-collaboration-mindset.md`

### Specify Acceptance Criteria

Every prompt MUST include acceptance criteria: "This is correct when [specific verifiable conditions]."
→ Source: `00-ai-fundamentals/ai-collaboration-mindset.md`

### Reference Existing Files

Always point AI at 2-3 existing files as pattern templates. Without references, AI invents its own inconsistent patterns.
→ Source: `00-ai-fundamentals/prompt-engineering-patterns.md`

### Fresh Session Per Feature

Use a fresh AI session per feature. 100-message threads produce inconsistent, constraint-violating output.
→ Source: `00-ai-fundamentals/context-management-strategy.md`

### AI Has No Concept of Correctness

"The AI said it's correct" is dangerous. AI predicts plausible tokens, not truth. Verify every claim, especially about APIs and versions.
→ Source: `00-ai-fundamentals/ai-collaboration-mindset.md`

### No Silent TODOs or Placeholders

NEVER generate TODO, FIXME, HACK, or placeholder comments in production code without explicit user permission. If a feature cannot be implemented fully, state the gap in the AI response — not silently in a code comment. Acceptable escape hatch: reference a tracker issue number and throw a descriptive error for unimplemented paths.
→ Source: `00-ai-fundamentals/ai-collaboration-mindset.md`

### Web Search Escalation

If you fail to solve a problem after 2 attempts, STOP guessing. Search the web or consult up-to-date documentation before making a 3rd attempt. State: "I failed twice. Searching for current documentation before retrying."
→ Source: `00-ai-fundamentals/escalation-protocol.md`

### Output Efficiency — Minimize Code in Chat

The developer does not read code. Do NOT echo code blocks in chat responses. Describe WHAT changed in plain language (1-2 sentences) and WHERE (file path + line range). Use file edit tools directly — never paste code back in chat. Only show code when the user explicitly asks "show me the code."
→ Source: `00-ai-fundamentals/beginner-vibe-coder-guide.md`

---

## RTL & Arabic (Always Active — All Projects Are Bilingual)

**All projects in this organization are bilingual (English + Arabic) by default. These rules always apply.**

### Arabic-First Architecture

Arabic support is an architectural requirement, NOT a localization afterthought. Every component, page, and feature MUST be designed for bidirectional text from day one. Direction at multiple levels: UI shell, workspace, editor document, paragraph, and inline span.
→ Source: `05-stack-guides/rtl-tech-stack.md`

### Logical CSS Properties Exclusively

Use logical CSS properties everywhere in UI chrome: Tailwind `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `border-s`, `rounded-s`. NEVER use physical properties (`ml-*`, `pl-*`, `left-*`, `right-*`, `text-left`) in UI chrome. Lint rule enforced.
→ Source: `02-engineering-practices/bidirectional-design-principles.md`

### Mirroring With Intent

Navigation, breadcrumbs, pagination, timelines, and directional icons MUST mirror in RTL. Logos, numbers, code, non-directional icons MUST NOT mirror. Directional icons use `rtl:rotate-180` or equivalent.
→ Source: `02-engineering-practices/bidirectional-design-principles.md`

### Arabic Typography Rules

Arabic text requires: line-height 1.6–1.8 (not 1.4), minimum font-weight 400 (never 300), zero letter-spacing (tracking disconnects cursive letters), no opacity on text blocks (causes jagged rendering in Firefox), no `word-break: break-all`.
→ Source: `02-engineering-practices/bidirectional-design-principles.md`

### Portal Direction Inheritance

Portal components (Dialog, Popover, DropdownMenu, Tooltip, Select, Menu, Drawer, overlay wrappers from React Portal, Radix, MUI, Ariakit, or Headless UI) do NOT inherit `dir` from the document. Every portal-based component MUST receive an explicit `dir` prop. This is the #1 RTL regression source.
→ Source: `05-stack-guides/rtl-tech-stack.md`

### Numeral Policy

Use Western Arabic numerals (0 1 2 3 4 5 6 7 8 9) for UI chrome by default. Do not globally forbid Arabic-Indic numerals (٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩); writing, publishing, education, legal, religious, archival, and institution-specific products may allow user-selectable numeral styles. Use `Intl.NumberFormat` with explicit numbering systems such as `ar-u-nu-latn` or `ar-u-nu-arab`.
→ Source: `02-engineering-practices/bidirectional-design-principles.md`

### RTL-Compliant Tech Stack

Use latest stable libraries with proven RTL support. MUI 9+ remains a fully valid, production-tested option — it is NOT deprecated. Tailwind CSS v4 + shadcn/ui (initialized with `--rtl`, Nova/base-ui style) + @base-ui/react + @radix-ui/react-direction DirectionProvider + React Aria is an alternative for products needing custom visual identity, code ownership, or zero-runtime RTL. In ANY stack: use logical CSS properties (Tailwind: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`; MUI Emotion: `marginInlineStart`/`paddingInlineEnd`/etc. or direction-aware `sx` props). Never use physical direction properties (`left`/`right`/`margin-left`/etc.) in UI chrome. Portal components (Dialog, Popover, Menu) must receive explicit `dir` in both MUI and shadcn. Run tests in both LTR and RTL. Run `npx rtlify-ai check` for automated RTL auditing.
→ Source: `05-stack-guides/rtl-tech-stack.md`

### Bilingual UI — All Text Uses i18n Keys

All user-facing strings MUST use i18n keys. No hardcoded English or Arabic strings in components. Every visible text element must reference a translation key. This applies to labels, buttons, placeholders, error messages, titles, and tooltips.
→ Source: `05-stack-guides/rtl-tech-stack.md`

### LTR/RTL Testing Before Commit

Every page MUST be tested in both LTR (English) and RTL (Arabic) modes before committing. Visual regression in either direction is a bug. Dual-direction E2E tests are mandatory.
→ Source: `05-stack-guides/rtl-tech-stack.md`

---

## Performance (Load for Performance-Sensitive Features)

### Profile Before Optimizing

NEVER optimize without measurement. Profile first. Optimize only measured bottlenecks.
→ Source: `02-engineering-practices/performance-optimization.md`

### Make It Work → Make It Clean → Make It Fast

Optimize only after correctness and cleanliness are established. Never optimize prematurely.
→ Source: `02-engineering-practices/performance-optimization.md`

### Performance Budgets

Set and enforce budgets: LCP < 2.5s, bundle < 200KB gzipped, API p95 < 500ms. Reject PRs that increase bundle >10%.
→ Source: `02-engineering-practices/performance-optimization.md`

---

## Session Bootstrap

1. Read this AGENTS.md — always
2. Read WORLD.md for product intent guardrails
3. For UI/UX work: also load `_guidelines/02-engineering-practices/ux-design-principles.md`, `_guidelines/02-engineering-practices/bidirectional-design-principles.md`, `_guidelines/06-frontend-patterns/visual-design-principles.md`
4. Look up task type in `_guidelines/_index/MASTER_INDEX.md` (mirrored by `sync-guidelines.ps1`)
5. Load primary guideline files per task-type table
6. Apply compact extracts when context is tight (<20K tokens)

---

## PROJECT-SPECIFIC SECTION — Property Management App

## Stack (Verified on npm — 2026-07-16)

| Layer                | Technology                         | Version           |
| -------------------- | ---------------------------------- | ----------------- |
| Desktop shell        | Electron                           | 43.1.1            |
| Frontend framework   | React                              | 19.x              |
| Language             | TypeScript                         | 5.x (strict mode) |
| Build tool           | electron-vite                      | 5.0.0             |
| UI component library | MUI Core + MUI X                   | 9.x               |
| RTL CSS flipping     | stylis-plugin-rtl + @emotion/cache | latest            |
| Forms                | React Hook Form                    | 7.81.0            |
| Validation           | Zod                                | 4.4.3             |
| i18n                 | react-i18next + i18next            | 26.x              |
| Database             | better-sqlite3                     | 12.11.1           |
| Router               | React Router (createBrowserRouter) | 7.x               |
| State (UI only)      | Zustand                            | latest            |
| Testing (unit)       | Vitest + React Testing Library     | latest            |
| Testing (E2E)        | Playwright                         | latest            |
| File MIME validation | file-type                          | 16.5.4 (CommonJS) |
| Excel export         | exceljs                            | 4.x               |
| Auth (local)         | bcrypt                             | latest            |
| Pre-commit hooks     | husky + lint-staged                | latest            |

Versions may be pinned to older major releases only when documented in an ADR (RTL regression, breaking change without migration guide, ecosystem lag).

---

## Forbidden Dependencies and Patterns

**Cloud / network:**

- No Firebase, Supabase, AWS Amplify, or any cloud database
- No NestJS, Express, Fastify, or any HTTP server
- No WebSockets, Socket.io, or real-time sync libraries
- No REST/GraphQL API clients (axios, fetch to external URLs, Apollo)
- No cloud storage SDKs (AWS S3, Azure Blob, Google Cloud Storage)

**Wrong desktop shell:**

- No Tauri, NW.js, Neutralino, or any alternative to Electron

**Wrong UI library:**

- No Tailwind CSS, shadcn/ui, Bootstrap, Ant Design, or Chakra UI
- No raw MUI `<Table>`, `<TableHead>`, `<TableBody>` — use `StandardTable`
- No raw hex colors, pixel values, or font families in component files — use `theme.palette.*`

**Wrong form patterns:**

- No `useState` per form field — use React Hook Form
- No custom validation functions — use Zod schemas
- No `<TextField type="number">` with spinner — use MUI v9 `NumberField`

**Wrong state:**

- No Redux, no MobX, no Recoil
- No SWR, no React Query (no network state — SQLite is local)
- No `[dir="rtl"]` CSS overrides — use logical CSS properties

**Wrong architecture:**

- No business logic in React components — belongs in service layer (`src/services/`)
- No direct SQLite calls from the renderer — all DB access goes through typed IPC handlers
- No `nodeIntegration: true`, no disabled context isolation
- No `better-sqlite3` calls in the renderer process — main process only

---

## Project-Specific Mandates

### Shared Components

- **Tables:** Use `StandardTable` for ALL list pages (property list, tenant list, payment history, ledger, recurring expenses). Never use raw MUI `<Table>`. `StandardTable` handles loading/empty/error/filtered-empty states and RTL automatically.
- **Dialogs:** Use `StandardDialog` for ALL modals. It enforces focus restoration, `disableEscapeKeyDown={isDirty}`, and unsaved-changes protection per `_guidelines/06-frontend-patterns/dialog-patterns.md`.
- **Page headers:** Use `PageHeader` component for all list and detail pages — consistent icon + title + subtitle + action button layout.
- **Notifications:** Use `useSnackbar()` hook + `GlobalSnackbar` component for ALL user feedback. Never use `alert()` or raw MUI `Snackbar`. Message strings are always i18n keys, never hardcoded.
- **Currency input:** Use `CurrencyInput` for all monetary fields — includes the "Convert" read-only display button for multi-currency view.
- **Numeric fields:** Use MUI v9 `NumberField` (not `<TextField type="number">`) for all quantities, amounts, and rates.

### IPC (Electron Main ↔ Renderer)

- All database reads and writes happen in the **main process** via `better-sqlite3`.
- Renderer calls `window.api.invoke('channel:action', payload)` — never imports `better-sqlite3` directly.
- IPC channel naming: `domain:verb` format (e.g., `tenants:getAll`, `payments:record`, `contracts:create`).
- All IPC handlers validate input with Zod before touching the database.
- All IPC handlers that perform multi-table writes use `db.transaction()` for atomicity.

### Financial Ledger Rules (Non-Negotiable)

- Ledger entries are **immutable** once written — no UPDATE or DELETE on ledger rows.
- Corrections MUST use reversal entries (a matching negative entry + a new correct entry).
- All financial writes (payment recording, rent posting, deposit movement) MUST be wrapped in `db.transaction()` — they are atomic or they fail entirely.
- Currency conversion is **display-only** — the ledger always records amounts in the base currency configured in Settings.

### Design System Tokens

- Use `theme.palette.*` for ALL colors — never raw hex, never rgba with opacity on Arabic text.
- Use `theme.spacing()` for ALL spacing (8px base grid).
- Font stacks: Arabic direction → `'Tajawal', 'Cairo', system-ui`; English direction → `'Inter', system-ui`.
- Dark mode: lighter surface colors for elevated elements (MUI Paper elevation) — no box-shadows in dark mode.

### i18n Rules

- ALL user-visible strings use `t('namespace.key')` — never hardcoded Arabic or English text in JSX.
- Translation files: `src/locales/ar.json` (Arabic, primary) and `src/locales/en.json` (English).
- Direction toggle: changes `document.documentElement.dir`, `theme.direction`, `i18n.changeLanguage()`, and the Emotion RTL cache atomically.
- First-paint flicker prevention: inline `<script>` in `index.html` sets `dir` from `localStorage` before React mounts.

### Document Upload Security

- ALL file uploads MUST be validated via `file-type@16.5.4` magic-byte inspection in the **main process**.
- Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`.
- Reject any file whose detected MIME type does not match the whitelist — regardless of file extension.

---

## Build & Validation Commands

```bash
npm run dev           # Start Electron + Vite dev server (hot reload)
npm run build         # Production build (i18n gate + typecheck + electron-vite)
npm run build:unpack  # Build + electron-builder --dir (dist/win-unpacked)
npm run build:installer # Compile the Inno Setup installer from dist/win-unpacked
npm run dist:win      # Full chain: build:unpack + build:installer
npm run lint          # ESLint (TypeScript rules)
npm run typecheck     # tsc --noEmit (strict mode, node + web projects)
npm test              # Vitest unit tests
npm run test:e2e      # Playwright E2E tests (both RTL and LTR)
npm run start         # Preview the built app locally (electron-vite preview)
```

Before suggesting any code change, verify it would pass `lint` and `typecheck`.
Never introduce TypeScript `any` casts, `eslint-disable` suppressions, or `@ts-ignore` without a comment explaining why.

---

## Deployment & Release (Production Pipeline)

### Deployment Architecture

The product ships through four coordinated channels — all live and verified in production:

| Channel            | Technology                                  | Trigger                              |
| ------------------ | ------------------------------------------- | ------------------------------------ |
| Desktop app        | Electron + Inno Setup 6 installer (Windows) | Git tag `v*.*.*` → GitHub Actions    |
| App distribution   | GitHub Releases (public repo, required)     | Manual "Publish release" click       |
| In-app auto-update | Custom updater (`updateService.ts`)         | Checks GitHub Releases API on launch |
| Marketing website  | Astro 7 on Netlify (`propmanager-website/`) | Every push to `main`                 |

- **Live website:** `https://property-manager-app.netlify.app` — download page bakes the direct setup.exe link at build time from the GitHub Releases API, with a `releases/latest/download/` static fallback and runtime JS re-hydration.
- **Auto-update flow:** app checks `releases/latest` → downloads `PropManager-{v}-setup.exe` → verifies SHA-256 against `SHA256SUMS.txt` from the same release → runs installer `/SILENT` → app quits → installer swaps files and **relaunches the app automatically**. Drafts and prereleases are ignored by design. User data (`%APPDATA%/PropManager`) is never touched by updates.
- **The GitHub repo MUST stay public** — a private repo 404s release assets, the releases API, the website download button, AND the in-app updater simultaneously.

### Release Procedure (Exact Steps)

The version lives in ONE place: `package.json`. It propagates automatically to the app UI, About dialog, installer filename, updater comparison, and website. NEVER hardcode a version anywhere else.

1. **Add a CHANGELOG.md entry** ABOVE the previous version, following Keep-a-Changelog format:
   `## [x.y.z] - YYYY-MM-DD` with `### Added` / `### Fixed` / `### Changed` bullets in plain language, plus a link reference at the bottom of the file. These bullets BECOME the GitHub release notes (extracted by `scripts/extract-changelog.mjs`) and the website changelog — a release without a CHANGELOG section fails. Verify extraction: `node scripts/extract-changelog.mjs x.y.z`. Commit: `git commit -m "docs(changelog): x.y.z"`.
2. **Bump + tag in one command:** `npm version patch` (or `minor` / `major`, with `-m "chore(release): v%s"`). This updates package.json, commits, and creates tag `vx.y.z`. Pre-commit hooks (lint-staged, i18n parity, typecheck) run automatically.
3. **Push:** `git push origin main --follow-tags`. The tag triggers `.github/workflows/release.yml` (~10–15 min on windows-latest).
4. **Publish (the only human gate):** go to the repo’s **Releases** section (right sidebar — NOT the Actions tab), open the draft `PropManager x.y.z`, pencil icon → **Publish release**. Until published, users and the updater see nothing. Drafts are only visible while logged in to GitHub.

**If the release build fails:** fix the cause, then re-point the tag — safe ONLY while no release was created: `git tag -f vx.y.z && git push origin main && git push origin vx.y.z --force`. NEVER move a tag that already has a published release; cut a new patch version instead.

### Configuration Files (What Controls What)

| File                                   | Purpose                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.github/workflows/release.yml`        | Tag-triggered: validates tag == package.json version (hard-fails on mismatch), builds app (`build:unpack`), compiles installer, extracts notes, creates DRAFT release. Uses `actions/checkout@v7` + `actions/setup-node@v7` (Node 24) — keep majors current. |
| `.github/workflows/ci.yml`             | Push/PR gate: lint, typecheck, tests.                                                                                                                                                                                                                        |
| `installer/windows/PropManager.iss`    | Bilingual (en/ar) Inno Setup script: per-user install, upgrade/downgrade guard, user-data preservation, silent-update relaunch via `IsSilentUpdate` Check function.                                                                                          |
| `scripts/build-installer.mjs`          | Locates ISCC, injects version via `/DAppVersion`, emits `installer/output/PropManager-{v}-setup.exe` + `SHA256SUMS.txt`.                                                                                                                                     |
| `src/main/services/updateService.ts`   | Auto-update engine (check/download/verify/install) + `INSTALLER_ARGS` + `WEBSITE_URL` constant surfaced in Settings › About.                                                                                                                                 |
| `netlify.toml`                         | Website deploy: `base = propmanager-website`, `publish = dist` (**relative to base** — never change to out/renderer), production `SITE_URL` env.                                                                                                             |
| `propmanager-website/astro.config.mjs` | Site URL fallback for canonical/sitemap.                                                                                                                                                                                                                     |
| `CHANGELOG.md`                         | Single source of release notes for GitHub Releases AND the website.                                                                                                                                                                                          |

### Hard-Won Pitfalls (Do Not Re-Learn These)

- **Inno Setup:** `WizardVerySilent` does NOT exist in Pascal Script — detect `/VERYSILENT` by scanning `ParamStr`/`ParamCount`. After ANY `.iss` edit, compile locally BEFORE pushing: run ISCC with a dummy `/DAppSourceDir` pointing at any small folder — syntax errors otherwise only surface in CI.
- **Inno Setup:** `[Run]` entries with `skipifsilent` never fire during silent updates — the silent-update relaunch needs its own entry (`Flags: nowait skipifnotsilent; Check: IsSilentUpdate`). Windows Restart Manager (`/RESTARTAPPLICATIONS`) cannot relaunch Electron apps.
- **Updater:** MUST pass `/SILENT`, never `/VERYSILENT` — the installer only auto-relaunches for silent-not-verysilent (regression-tested in `updateService.test.ts`).
- **Netlify/Astro:** root `tsconfig.node.json` / `tsconfig.web.json` MUST stay self-contained (no `extends` into root `node_modules`) — Astro’s rolldown crawls up and parses them without root deps installed, crashing the build.
- **Netlify:** the toml `publish` path is relative to `base`; Netlify’s AI build-failure suggestions have been wrong every time — always reproduce and verify the root cause locally.

### Post-Release Verification Checklist

After clicking Publish, verify in order:

1. **Release assets:** the release page shows `PropManager-{v}-setup.exe` AND `SHA256SUMS.txt`.
2. **Auto-update loop:** on a machine with the previous version → Settings → About → Check for Updates → install → app must **restart by itself** on the new version, with all user data intact.
3. **Website:** the download page shows the new version/size/date (runtime check is instant; baked HTML refreshes on next push to `main`) and the button downloads the exe directly — no releases-page detour.
4. **Netlify deploy:** confirm the site deploy triggered by the release commits is green.
5. **Troubleshooting:** silent-install behavior is logged to `%TEMP%\Setup Log*.txt`; workflow status is queryable unauthenticated via the GitHub Actions API (run logs require repo admin).

Full details: `docs/release-checklist.md` and `docs/deployment.md`.

---

## AI Response Format (Vibe Coder Optimized)

Since the developer (vibe coder) cannot read code, AI MUST optimize responses for behavioral understanding:

- Describe WHAT changed in plain language (1-2 sentences), not HOW
- Specify WHERE: file path + line range
- Use file edit tools directly — never paste code blocks in chat
- Only show code when the developer explicitly asks "show me the code"
- When describing errors, translate technical messages into plain language
- When describing changes, compare before/after behavior, not before/after code

---

## Forbidden Patterns

- No `console.log` in production code
- No `!important` in CSS
- No TypeScript `any` without a comment explaining why
- No inline styles when design system tokens exist
- No hardcoded UI strings — all text MUST use i18n keys (every project is bilingual)
- No `// TODO`, `// FIXME`, `// HACK` without explicit permission — state gaps in the AI response instead
- No placeholder or filler content in UI (no "lorem ipsum", no "test test test")
- No physical CSS direction properties (`ml-*`, `pl-*`, `left-*`, `right-*`, `text-left`) in UI chrome — use logical properties (`ms-*`, `ps-*`, `start-*`, `text-start`)
- No raw hex colors, pixel values, or font families in components — use design tokens
- No `letter-spacing` / `tracking-*` on Arabic text — disconnects cursive letters
- No opacity / `rgba()` transparency on Arabic text blocks — causes jagged rendering in Firefox
- No portal components (Dialog, Popover, DropdownMenu) without explicit `dir` prop
- No custom navigation-blocking workarounds — use the framework's native blocker (React Router: `useBlocker` with `createBrowserRouter`)
- No stringified JSON or path strings as data-fetching cache keys — use raw tuples `['entity', params] as const`
- No trusting client-supplied `Content-Type` for file uploads — verify MIME via magic-byte inspection (`file-type` package)

## How to Use This File

1. **Run** `sync-guidelines.ps1` from this repo to mirror guidelines into `_guidelines/` (skip if already done)
2. **Create** this file as `AGENTS.md` in your project root (all rules are inline — no external file references needed)
3. **Search for `[FILL]`** and replace ALL occurrences with project-specific values
4. **Review** the global rules above — remove any that don't apply to your stack
5. **Add** any project-specific rules in the designated section
6. **Commit** to Git. Treat this file as code — changes go through review.
7. **Never let AI modify this file without human approval.**

## Maintenance

- **Quarterly:** Audit rules against source guidelines. Re-extract outdated rules.
- **When guidelines change:** Check if extracted rules need updating.
- **When stack changes:** Update the Stack table and review all rules.
- **Source of truth:** Central repo at `D:\WebApps\global-guidelines-for-a-vibe-coder\` — run `sync-guidelines.ps1` to refresh `_guidelines/`

---

**Cross-References (in `_guidelines/` mirror):**

- Authority hierarchy: `_guidelines/08-governance/ai-governance-framework.md`
- Extraction methodology: `_guidelines/08-governance/rule-extraction-methodology.md`
- Classification system: `_guidelines/08-governance/classification-system.md`
- Loading strategy: `_guidelines/_index/RETRIEVAL_RULES.md`
- Design principles: `_guidelines/02-engineering-practices/ux-design-principles.md`, `_guidelines/02-engineering-practices/bidirectional-design-principles.md`
- Design governance: `_guidelines/08-governance/design-system-governance.md`

---

## Skills

Skill files live at `_skills/<name>.skill.md`. Load when the trigger matches the current task.
