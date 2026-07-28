# Deployment Guide

How PropManager is built, packaged and released. See `deployment-architecture.md`
for the full architecture and risk analysis, and `release-checklist.md` for the
per-release checklist.

## Pipeline at a Glance

```
Developer commits → GitHub main
      │
      ├─ push tag v*.*.* ──► GitHub Actions (release.yml, windows-latest)
      │                        1. guard: tag == package.json version
      │                        2. npm ci
      │                        3. npm run build:unpack   → dist/win-unpacked/
      │                        4. npm run build:installer → installer/output/*.exe + SHA256SUMS.txt
      │                        5. extract-changelog.mjs   → release notes
      │                        6. gh release create --draft
      │                        7. human review → Publish release
      │                              └─► app auto-updater sees the new version
      │
      └─ every push to main ──► Netlify rebuilds the website (netlify.toml)
                                  └─ download page + changelog update automatically
```

## Local Build Commands

```bash
npm run build:unpack     # electron-builder → dist/win-unpacked/ (unpacked app)
npm run build:installer  # Inno Setup → installer/output/PropManager-<v>-setup.exe + SHA256SUMS.txt
npm run dist:win         # both steps in sequence
```

Requirements on the build machine:

- Node.js 22, `npm ci` done
- Inno Setup 6.5+ installed (bundles the official `Languages\Arabic.isl`);
  `scripts/build-installer.mjs` finds ISCC automatically or via the
  `INNO_SETUP_ISCC` environment variable
- No running PropManager/dev instances (locked native modules break packaging)

## Version Management (single source of truth)

`package.json` `version` is the only place a version is defined. It propagates to:

- App UI / About dialog — via the `app:info` IPC handler
- Installer filename + metadata — injected as `/DAppVersion` by `build-installer.mjs`
- GitHub Release — the workflow refuses to build if the tag ≠ package.json
- Website download page — reads the GitHub Releases API at runtime
- Changelog — `CHANGELOG.md` entry per version (also rendered by the website)

## Releasing

```bash
npm version 1.1.0            # bumps package.json + creates tag v1.1.0
# add a "## [1.1.0] - YYYY-MM-DD" section to CHANGELOG.md, commit
git push origin main --tags  # tag push triggers the release workflow
```

The workflow creates a **draft** release — verify the installer and notes, then
click **Publish**. The in-app updater ignores drafts, so nothing reaches users
until you publish.

## Auto-Updates

The app checks GitHub Releases (`src/main/services/updateService.ts`), downloads
the new installer in the background, verifies its SHA-256 against
`SHA256SUMS.txt`, and asks the user before installing. The installer runs
per-user (no UAC), preserves all user data, and blocks downgrades.

## Code Signing (placeholder)

No certificate is currently owned. When one is acquired:

1. Uncomment the `SignTool` line in `installer/windows/PropManager.iss`
2. Configure the certificate in the CI runner (secrets + signtool)
3. Windows SmartScreen warnings disappear after reputation builds

## Troubleshooting

| Symptom                                 | Fix                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `EBUSY` during `build:unpack`           | Close all running PropManager/`npm run dev` instances (they lock `better_sqlite3.node`)                                      |
| `ISCC.exe not found`                    | Install Inno Setup 6.5+ or set `INNO_SETUP_ISCC`                                                                             |
| `Arabic.isl missing`                    | Upgrade Inno Setup — Arabic is official since 6.5                                                                            |
| Release workflow fails at version guard | Tag must equal `package.json` version exactly (`v1.2.3` ↔ `1.2.3`)                                                           |
| Update not offered in app               | Release still a draft, or the asset name doesn't end in `-setup.exe`                                                         |
| Migration errors after update           | Check `%APPDATA%/propmanager/logs/main.log`; restore from a backup (pre-restore emergency backups are created automatically) |

## Recovery

- **Bad release published:** delete the GitHub release + tag; the updater only
  ever sees the latest published release, so removing it stops the rollout.
  Users who already updated can reinstall the previous setup.exe from the
  releases page — user data is never touched by install/uninstall.
- **Corrupted install:** re-run the same setup.exe (repair path) or uninstall +
  reinstall; the uninstaller never deletes `%APPDATA%/propmanager` silently.
