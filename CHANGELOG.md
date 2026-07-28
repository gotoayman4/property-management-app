# Changelog

All notable changes to PropManager (مدير العقار) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

Release notes on GitHub Releases are generated from this file (`scripts/extract-changelog.mjs`), so every release MUST have a section here before tagging.

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

[1.0.0]: https://github.com/gotoayman4/property-management-app/releases/tag/v1.0.0
