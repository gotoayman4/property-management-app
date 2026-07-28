# Release Checklist

Run through this list for every release. The whole process is one version
bump, one changelog entry, and one tag push — everything else is automated.

## Before Release

- [ ] `main` is green: `npm run lint && npm run type-check && npm test`
- [ ] E2E pass locally: `npm run test:e2e` (covers RTL + LTR)
- [ ] `CHANGELOG.md` has a `## [X.Y.Z] - YYYY-MM-DD` section for the new version
      (this becomes the GitHub release notes AND the website changelog)
- [ ] i18n parity: `node scripts/check-i18n-parity.js`
- [ ] No uncommitted changes, no running dev instances

## Release

- [ ] `npm version X.Y.Z` (updates package.json, commits, creates tag `vX.Y.Z`)
- [ ] `git push origin main --tags`
- [ ] Watch the **Release** workflow in GitHub Actions (≈10–15 min on
      `windows-latest`); it fails fast if the tag ≠ package.json version

## Verify the Draft Release

- [ ] Draft release appeared under GitHub → Releases with:
  - [ ] `PropManager-X.Y.Z-setup.exe`
  - [ ] `SHA256SUMS.txt`
  - [ ] Release notes matching the CHANGELOG section
- [ ] Download the installer on a Windows machine; verify checksum:
      `Get-FileHash .\PropManager-X.Y.Z-setup.exe -Algorithm SHA256`
- [ ] Install over the previous version — data intact, version correct in the
      About dialog

## Publish

- [ ] Click **Publish release** (updater and website only see published releases)
- [ ] On an older installed version: Settings → Check for Updates offers X.Y.Z,
      downloads, verifies, installs, and relaunches with data intact
- [ ] Website download page shows the new version/size/date (runtime API — no
      redeploy needed); changelog page updates on the next push to main

## If Something Goes Wrong

- Workflow failed → fix, delete the tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), re-tag
- Bad build published → delete the release + tag; the previous release becomes
  "latest" again and the rollout stops (see `deployment.md` → Recovery)
