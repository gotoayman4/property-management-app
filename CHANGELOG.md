# Changelog

All notable changes to PropManager (مدير العقار) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

Release notes on GitHub Releases are generated from this file (`scripts/extract-changelog.mjs`), so every release MUST have a section here before tagging.

## [1.1.0] - 2026-07-28

### Added

- Automatic update downloads: when a new version is found, the app now downloads it in the background (can be turned off in Settings → About & Updates)
- VS Code-style update notifications: a prompt with a Download button when an update is available, and a Restart button when it is ready to install
- About dialog available from the top bar (info icon) with app version, runtime details, links and a manual “Check for Updates” button

### Fixed

- Notification messages with an action button now always include a close button so they can be dismissed

## [1.0.2] - 2026-07-28

### Fixed

- App now restarts automatically after installing an in-app update (silent installer relaunch)
- Release/CI build pipelines updated to current GitHub Actions versions (Node 24 — removes deprecation warning)

## [1.0.1] - 2026-07-28

### Added

- App website link in Settings → About, next to the GitHub project page link

### Fixed

- Website download button now downloads the setup file directly instead of opening the releases page
- Website canonical/sitemap URLs corrected to the final production domain

## [1.0.0] - 2026-07-28

### Added

- Property, unit, tenant and contract management with an Arabic-first bilingual UI (RTL/LTR)
- Immutable financial ledger with reversal-based corrections and multi-currency display conversion
- Payment recording, rent posting, recurring expenses and deposit tracking
- Reports with Excel export
- Encrypted local backups with integrity verification, scheduled pruning and restore
- Notifications center for contract expiry and payment reminders
- Dark and light themes with full RTL mirroring
- Local authentication (bcrypt) for single-user desktop use
- In-app auto-update system: checks GitHub Releases, verifies SHA-256 integrity, silent Inno Setup upgrade (Settings → About)
- Bilingual (English/Arabic) Windows installer with per-user install, upgrade/downgrade handling and user-data preservation

[1.1.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.1.0
[1.0.2]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.2
[1.0.1]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.1
[1.0.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.0
