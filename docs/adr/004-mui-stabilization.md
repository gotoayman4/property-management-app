# ADR-004: MUI Version Stabilization

**Status:** Accepted
**Date:** 2026-07-27
**Deciders:** Dr. Ayman Saleh

## Context

The project was initially set up with `@mui/material@^9.0.0-alpha.0` (along with icons-material,
x-data-grid, and x-date-pickers) during the MUI 9 alpha period. As of July 2026, MUI 9 has
reached stable releases:

- `@mui/material`: 9.2.0
- `@mui/icons-material`: 9.2.0
- `@mui/x-data-grid`: 9.9.0
- `@mui/x-date-pickers`: 9.9.0

The semver range `^9.0.0-alpha.0` was already resolving to these stable versions in the
lockfile, but the package.json specifiers still referenced the alpha tag, creating confusion.

## Decision

**Pin to stable MUI 9.x releases.** Update package.json specifiers from `^9.0.0-alpha.0` to
the current stable ranges:

- `@mui/material`: `^9.2.0`
- `@mui/icons-material`: `^9.2.0`
- `@mui/x-data-grid`: `^9.9.0`
- `@mui/x-date-pickers`: `^9.9.0`

No code changes are required — the installed versions were already stable. This is a specifier
cleanup only.

## Rationale

- The alpha specifiers were misleading — the actual installed packages were stable 9.x.
- Pinning to explicit stable ranges makes the dependency intent clear.
- MUI 9 is fully production-tested and documented. It is NOT deprecated.
- The `^` semver prefix allows minor/patch updates within 9.x automatically.

## Consequences

- `npm install` produces no functional change (lockfile already resolved to stable).
- Future `npm update` will stay within MUI 9.x stable (no alpha regressions).
- The project benefits from MUI 9's stable API, RTL support, and TypeScript types.
- No migration effort needed — the API surface between alpha and stable 9.x is identical.
