# Deployment Guide

## Build

```bash
npm run build
```

Produces platform-specific artifacts in `out/make/`:

- **Windows:** NSIS installer (`out/make/nsis/`) + unpacked app
- **macOS:** DMG (`out/make/dmg/`)
- **Linux:** AppImage, snap, deb

## Windows Distribution

### Option A: NSIS (electron-builder default)

The `out/make/nsis/PropManager-*-setup.exe` is the ready-to-distribute installer.
Includes desktop shortcut, Start Menu entry, and uninstaller.

### Option B: Inno Setup (Recommended)

For better bilingual (Arabic/English) installer UI:

1. Build the app: `npm run build`
2. Open the Inno Setup script in `installer/windows/`
3. Point the Inno Setup source to `out/` directory
4. Compile the Inno Setup script to produce the final installer

See ADR-003 for the rationale behind choosing Inno Setup over NSIS.

## macOS Distribution

### Unsigned (Current)

Without code signing, macOS users must:

```bash
# Remove quarantine attribute after downloading
xattr -d com.apple.quarantine /Applications/PropManager.app
```

Or right-click → Open on first launch.

### Signed (Future)

When code signing is configured:

1. Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables
2. Build: `npm run build`
3. The entitlements in `build/entitlements.mac.plist` grant minimum required privileges
4. Enable notarization in `electron-builder.yml`: `notarize: true`

## Linux Distribution

AppImage, snap, and deb packages are produced in `out/make/`:

```bash
# AppImage (portable)
chmod +x PropManager-*.AppImage
./PropManager-*.AppImage

# Deb (Debian/Ubuntu)
sudo dpkg -i propmanager_*.deb
```

## Auto-Updates

Auto-update is currently **disabled** (see ADR-003). To enable:

1. Set up an update server (GitHub Releases, S3, or generic HTTP)
2. Update `publish.url` in `electron-builder.yml`
3. Install `electron-updater` and configure in main process

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to main:

1. Checkout + Node.js 22
2. `npm ci`
3. i18n parity check
4. ESLint lint
5. TypeScript type-check
6. Vitest unit tests

Build artifacts are not yet produced in CI (manual local build for distribution).

## Troubleshooting

### Build fails with native module errors

```bash
# Rebuild native modules
npm rebuild

# Windows: ensure build tools are installed
npm install -g windows-build-tools
```

### Database migration errors

The app runs migrations automatically on startup. If a migration fails:

1. Check the log file: `%APPDATA%/PropManager/logs/main.log`
2. Restore from backup (the app creates pre-restore emergency backups)
3. If all else fails, delete the database and let the app recreate it (loses all data)
