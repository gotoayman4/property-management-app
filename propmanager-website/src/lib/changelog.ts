/**
 * @file Build-time parser for the repository CHANGELOG.md.
 *
 * INTENT: The changelog page renders the SAME file that generates GitHub
 *         release notes — one source of truth, re-read on every site build
 *         (Netlify rebuilds on every push to main).
 * CAVEAT: The website builds with base dir `propmanager-website/` on Netlify,
 *         but the full repo is cloned, so the repo-root CHANGELOG.md is always
 *         present one level up. `import.meta.url` is NOT used because Astro
 *         bundles this module into dist/.prerender/ where relative URLs break —
 *         we walk up from the build cwd instead.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ChangelogSection {
  /** e.g. "Added" / "Fixed" — heading text after "### ". */
  heading: string
  items: string[]
}

export interface ChangelogRelease {
  version: string
  date: string
  sections: ChangelogSection[]
}

/** Find CHANGELOG.md by walking up from the current working directory. */
function findChangelog(): string {
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'CHANGELOG.md')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('CHANGELOG.md not found — the website must build inside the repository')
}

/** Parse Keep-a-Changelog markdown into structured releases (newest first). */
export function parseChangelog(): ChangelogRelease[] {
  const raw = readFileSync(findChangelog(), 'utf8')
  const releases: ChangelogRelease[] = []
  let current: ChangelogRelease | null = null
  let section: ChangelogSection | null = null

  for (const line of raw.split(/\r?\n/)) {
    const release = line.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?\s*-?\s*(\S*)/)
    if (release) {
      current = { version: release[1], date: release[2] ?? '', sections: [] }
      releases.push(current)
      section = null
      continue
    }
    const heading = line.match(/^###\s+(.+)/)
    if (heading && current) {
      section = { heading: heading[1].trim(), items: [] }
      current.sections.push(section)
      continue
    }
    const item = line.match(/^-\s+(.+)/)
    if (item && current) {
      if (!section) {
        section = { heading: '', items: [] }
        current.sections.push(section)
      }
      section.items.push(item[1].trim())
    }
  }
  return releases
}
