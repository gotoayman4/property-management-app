/**
 * @file extract-changelog.mjs — prints the CHANGELOG.md section for one version.
 *
 * INTENT: Feed GitHub Release notes from the same file users read (Keep a
 *         Changelog format). Used by .github/workflows/release.yml.
 * USAGE:  node scripts/extract-changelog.mjs 1.2.3   → section body on stdout
 * CAVEAT: Exits successfully with a fallback line when the version has no
 *         section yet — a missing changelog entry must not block a release,
 *         the draft-review step catches it instead.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/extract-changelog.mjs <version>')
  process.exit(1)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let changelog = ''
try {
  changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
} catch {
  // No changelog file at all — fall through to the fallback output below.
}

// Keep a Changelog headings: "## [1.2.3] - 2026-07-28" (or without brackets).
const lines = changelog.split(/\r?\n/)
/**
 * @param {string} line
 * @return {boolean} whether the line is any "##" changelog heading
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs build script; return type is declared in the JSDoc above but the rule does not read JSDoc for plain JS files.
const isHeading = (line) => /^##\s+/.test(line)
/**
 * @param {string} line
 * @return {boolean} whether the line is the heading for the requested version
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs build script; return type is declared in the JSDoc above but the rule does not read JSDoc for plain JS files.
const matchesVersion = (line) =>
  new RegExp(`^##\\s+\\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(line)

const start = lines.findIndex(matchesVersion)
if (start === -1) {
  console.log(`See CHANGELOG.md for details on version ${version}.`)
  process.exit(0)
}
let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (isHeading(lines[i])) {
    end = i
    break
  }
}
// Drop "[x.y.z]: https://..." link-reference definitions — noise in release notes.
const body = lines
  .slice(start + 1, end)
  .filter((line) => !/^\[[^\]]+\]:\s+\S/.test(line))
console.log(body.join('\n').trim())
