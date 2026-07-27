# ADR-003: Packaging and Distribution Strategy

**Status:** Accepted  
**Date:** 2026-07-27  
**Deciders:** Dr. Ayman Saleh

## Context

PropManager is an offline, single-user Electron desktop application. Distribution is via direct
download (website or shared drive), not through app stores. The application contains no
server-side components and stores all data locally in SQLite.

## Decision

### 1. Code Signing — Deferred

**Decision:** Ship unsigned binaries for the initial release. No code-signing certificate will
be purchased or configured at this time.

**Rationale:**

- This is a single-user tool distributed to a known audience (property managers).
- Windows SmartScreen warnings can be bypassed by the user ("More info → Run anyway").
- macOS Gatekeeper warnings are acceptable for direct distribution outside the App Store.
- Code signing adds operational complexity (certificate management, timestamp servers,
  renewal automation) that is not justified for the current user base.
- When distribution scales to unknown users or app stores, code signing will be re-evaluated.

**Future path:** Purchase an EV code signing certificate (Windows) and Apple Developer
certificates (macOS) when distribution requires trusted binaries.

### 2. Windows Installer — Inno Setup (External)

**Decision:** Windows installer will be created using [Inno Setup](https://jrsoftware.org/isinfo.php),
**not** NSIS (which electron-builder defaults to).

**Rationale:**

- Inno Setup provides better control over Arabic/Bilingual UI during installation.
- Inno Setup is a mature, well-understood tool in the Windows ecosystem.
- The electron-builder NSIS config in `electron-builder.yml` is retained as a reference
  but is not the primary distribution artifact for Windows.

**Implementation:** Inno Setup script will be maintained separately (e.g., `installer/windows/`)
and run as a post-build step. The electron-builder output (`out/make/`) provides the unpacked
app that Inno Setup packages.

### 3. macOS — Entitlements Without Signing

**Decision:** `build/entitlements.mac.plist` is provided for structural completeness.
`notarize: false` in electron-builder config. The entitlements file grants the minimum
privileges needed for the app to function.

**Rationale:**

- Even without signing, the entitlements file documents the app's privilege requirements.
- If signing is added later, the entitlements are already correct and tested.

### 4. Auto-Updates — Enabled via Custom Updater + GitHub Releases (Amended 2026-07-28)

**Decision (amended):** Auto-update is implemented with a custom main-process update service
(`src/main/services/updateService.ts`) that checks GitHub Releases, verifies SHA-256, and runs
the Inno Setup installer silently. `electron-updater` is NOT used.

**Rationale:**

- `electron-updater` only services NSIS/Squirrel/MSI installs on Windows — incompatible with
  the Inno Setup decision in §2 of this ADR.
- GitHub Releases provides free, immutable, CDN-backed hosting with a public JSON API.
- Update checks are the second sanctioned network exception (after ADR-001 FX rates):
  main-process only, HTTPS to github.com/api.github.com only, user-disableable in Settings.
- Full design: `docs/deployment-architecture.md` §5.

### 5. Sandbox — Context Isolation Enabled, Node Integration Disabled

**Decision:** The app uses `contextIsolation: true` and `nodeIntegration: false` (already
implemented). No Electron sandbox override is applied.

**Rationale:**

- Context isolation + preload script is the secure default for Electron 43+.
- The preload bridge (`window.api`) provides a controlled IPC surface.
- No `webPreferences.sandbox: false` override exists in the codebase.
- The app legitimately needs Node.js APIs (better-sqlite3, fs) but only in the main process.

## Consequences

- Users will see SmartScreen/Gatekeeper warnings on first run — acceptable for current audience.
- macOS users must right-click → Open (or use `xattr -d com.apple.quarantine`) on first run.
- Windows installer (Inno Setup) is a separate concern from the electron-builder config.
- The electron-builder config remains useful for `npm run build` (packages the app) even
  though the final Windows installer uses Inno Setup.
- Auto-update ships in-app via the custom updater; disabling it is a Settings toggle.
