# Deployment Architecture — PropManager (مدير العقار)

**Status:** Active — supersedes the "manual distribution" posture of ADR-003 §4.
**Date:** 2026-07-28
**Scope:** Application packaging, Windows installer, auto-updates, marketing website, Netlify
hosting, GitHub release workflow, and centralized version management.

---

## 1. System Overview

PropManager is an offline, single-user Electron desktop app (SQLite, no server). The deployment
system therefore has **no backend of its own** — it is built entirely on free, static
infrastructure:

| Concern           | Technology                        | Why                                                                   |
| ----------------- | --------------------------------- | --------------------------------------------------------------------- |
| Source of truth   | GitHub repository (`main` branch) | Already in use; free private/public repos                             |
| App build         | electron-vite + electron-builder  | Already in use (`npm run build`, `electron-builder --dir`)            |
| Windows installer | Inno Setup 6.7.x (latest stable)  | ADR-003: superior bilingual (Arabic RTL) installer UI vs NSIS         |
| Release hosting   | GitHub Releases                   | Free, versioned, immutable assets, CDN-backed, CORS-enabled API       |
| Auto-updates      | Custom main-process updater       | `electron-updater` cannot service Inno Setup installs (see §5)        |
| Website           | Astro 6 static site               | Zero-JS-by-default → Lighthouse >95; first-class i18n routing         |
| Website hosting   | Netlify (Git-connected)           | Free tier, deploy previews, branch deploys, headers/redirects support |
| CI/CD             | GitHub Actions                    | Free for public repos; Windows runners ship Inno Setup preinstalled   |

## 2. Release Pipeline

```
 Developer commits code
          │
          ▼
 ┌─────────────────────┐   push to main    ┌──────────────────────────┐
 │  GitHub Repository  │ ────────────────► │  CI (ci.yml)             │
 │  (main branch)      │                   │  lint · typecheck ·      │
 └─────────┬───────────┘                   │  i18n parity · vitest    │
           │                               └──────────────────────────┘
           │ push tag  v1.x.y
           ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  Release workflow (release.yml, windows-latest)                    │
 │                                                                    │
 │  1. Verify tag == package.json version (single source of truth)   │
 │  2. npm ci → quality gates → electron-vite build                  │
 │  3. electron-builder --dir      → unpacked win app                │
 │  4. ISCC PropManager.iss        → PropManager-{ver}-setup.exe     │
 │  5. SHA256SUMS.txt              → integrity manifest              │
 │  6. Create GitHub Release       → assets + notes from CHANGELOG   │
 └───────────────┬────────────────────────────────────────────────────┘
                 │
     ┌───────────┴──────────────────────────┐
     ▼                                      ▼
 ┌───────────────────────────┐    ┌─────────────────────────────────┐
 │  GitHub Release (public)  │    │  Netlify (website)              │
 │  · setup.exe              │    │  auto-builds propmanager-website│
 │  · SHA256SUMS.txt         │    │  on every push to main;         │
 │  · release notes          │    │  download page reads Releases   │
 └───────────┬───────────────┘    │  API at runtime → always shows  │
             │                    │  the latest version (no rebuild)│
             ▼                    └─────────────────────────────────┘
 ┌───────────────────────────┐
 │  Installed apps           │
 │  updateService checks     │
 │  releases/latest → SHA-256│
 │  verify → silent install  │
 └───────────────────────────┘
```

## 3. Deliverables per Release

| Artifact                      | Produced by              | Published to    |
| ----------------------------- | ------------------------ | --------------- |
| `PropManager-{ver}-setup.exe` | Inno Setup (ISCC)        | GitHub Release  |
| `SHA256SUMS.txt`              | release workflow         | GitHub Release  |
| Release notes                 | `CHANGELOG.md` extract   | GitHub Release  |
| Version metadata              | Release tag + API JSON   | GitHub API      |
| Website                       | Astro build              | Netlify CDN     |
| Update availability           | GitHub `releases/latest` | consumed by app |

## 4. Centralized Version Management

**Single source of truth: `package.json` → `version`.** Propagation is automatic:

| Consumer              | Mechanism                                                                          |
| --------------------- | ---------------------------------------------------------------------------------- |
| App UI / About dialog | `app.getVersion()` (Electron reads `package.json`) via `app:getInfo` IPC           |
| Update system         | Compares `app.getVersion()` against latest GitHub release tag                      |
| Installer             | `scripts/build-installer.mjs` reads `package.json`, passes `/DAppVersion=` to ISCC |
| GitHub Release        | Tag `v{version}`; workflow **fails** if tag ≠ `package.json` version               |
| Website download page | Client-side fetch of `releases/latest` (version, date, size, notes)                |
| Changelog             | `CHANGELOG.md` (Keep a Changelog format), enforced by release checklist            |

Releasing = ONE edit (`npm version x.y.z`) + updating `CHANGELOG.md` + pushing the tag.

## 5. Auto-Update Design Decision

**Options considered:**

1. **`electron-updater` (NSIS target)** — industry default, but requires abandoning Inno Setup
   (it can only update NSIS/Squirrel/MSI/AppImage installs on Windows). Rejected: ADR-003's
   bilingual-installer requirement stands, and NSIS Arabic RTL support remains poor.
2. **Squirrel.Windows** — delta updates, but no real installer UI at all (no language selection,
   no directory choice). Rejected.
3. **Custom updater + Inno Setup + GitHub Releases** — **chosen.** A ~200-line main-process
   service using Electron's `net` module:
   - `GET api.github.com/repos/{owner}/{repo}/releases/latest` (versioned header, no auth needed)
   - semver compare against `app.getVersion()`; skip drafts/prereleases
   - download `PropManager-{ver}-setup.exe` to a temp dir with progress events
   - verify SHA-256 against `SHA256SUMS.txt` from the same release (integrity gate)
   - on user confirmation: launch `setup.exe /SILENT /NORESTART /SUPPRESSMSGBOXES` and quit
   - Inno Setup upgrades in place (same AppId), preserving `%APPDATA%` user data + SQLite DB

   Trade-off: no delta updates (full installer download, ~100 MB). Acceptable for a desktop LOB
   app with infrequent releases. Failure modes are all recoverable: a failed download or hash
   mismatch simply leaves the current version running (rollback = the old app is never touched
   until the installer runs, and the installer itself is transactional).

**Network policy:** the app is offline-first; ADR-001 already defines the one allowed network
exception (FX rates). Update checks are the second sanctioned exception: main-process only,
HTTPS to `api.github.com`/`github.com` only, user-disableable in Settings, and never blocks
app startup.

## 6. Website Architecture

- **Stack:** Astro 6 (static output), vanilla CSS design tokens, no UI framework, no client JS
  except theme/language toggle and the download-page release fetch (~2 KB total).
- **Location:** `propmanager-website/` in the same repo (monorepo-style; Netlify `base` points
  at it, so app-only commits can be ignored by Netlify's build-skip logic).
- **i18n:** Arabic (RTL) is the default locale at `/`; English under `/en/`. Both trees are
  fully static; `hreflang` alternates + localized sitemap included.
- **Theming:** CSS custom properties, `prefers-color-scheme` default + manual toggle persisted
  to `localStorage` (inline script prevents flash — same pattern the app uses).
- **Monetization-ready:** pricing data isolated in one data module (`src/data/editions.ts`) and
  the download CTA reads from it — adding paid tiers later = new data entries + a pricing page,
  no redesign. No account/licensing assumptions baked into components.
- **SEO:** per-page meta + Open Graph + JSON-LD (`SoftwareApplication`), sitemap, robots.txt,
  canonical URLs, social preview image, favicon set.

## 7. tsconfig.web.json / tsconfig.web.tsbuildinfo (Part 8 finding)

- `tsconfig.web.json` — **required, but not for the website.** It is the Electron _renderer_
  typecheck project (`npm run typecheck:web`). The name refers to the "web" (renderer) side of
  the Electron app. It stays untouched; the marketing website has its own isolated toolchain
  inside `propmanager-website/`.
- `tsconfig.web.tsbuildinfo` — **build artifact, must not be committed.** It is TypeScript's
  incremental-build cache (commit `1824848` added it by mistake). Action: remove from git,
  add `*.tsbuildinfo` to `.gitignore`.

## 8. Risk Register

| Risk                                                    | Impact | Mitigation                                                                                                                                            |
| ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsigned binaries → SmartScreen warning                 | Medium | Documented bypass on download page; ADR-003 defers signing; installer + workflow have signing placeholders so a future certificate is a config change |
| Update installs a corrupted binary                      | High   | SHA-256 verification mandatory before launch; mismatch aborts + notifies                                                                              |
| GitHub API rate limit (60/hr unauth)                    | Low    | App checks at most once per 4h + manual trigger; website caches response in `sessionStorage`                                                          |
| Tag / package.json version drift                        | Medium | Release workflow hard-fails on mismatch                                                                                                               |
| Update while app has unsaved writes                     | Medium | Installer launched only after `before-quit` backup hook completes; Inno `CloseApplications` handles stragglers                                        |
| Repo is private → Releases API 404                      | High   | Release repo must be public (or website/app switch to authenticated proxy later); documented in release checklist                                     |
| Netlify rebuilds on app-only commits                    | Low    | Netlify build skipping via `ignore` command scoped to `propmanager-website/`                                                                          |
| Native module (better-sqlite3) ABI mismatch in CI build | High   | Workflow runs `electron-rebuild` exactly as local `npm run build` does                                                                                |
| Downgrade installs over newer version                   | Low    | Inno script compares versions and warns before proceeding                                                                                             |

## 9. Future CI/CD Extensions

- **Code signing:** add `CSC_LINK`/cert secrets + `SignTool` step in `release.yml` (placeholder
  stage already present, commented).
- **macOS/Linux:** electron-builder targets already configured; add matrix jobs when needed.
- **Freemium:** licensing service would slot in as a new release asset (license server URL in
  Settings) — no changes to the update pipeline required.
- **E2E in CI:** Playwright against the packaged build on a windows runner (Phase 2 of ci.yml).
