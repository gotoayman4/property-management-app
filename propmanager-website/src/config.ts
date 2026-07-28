/**
 * @file Site-wide constants for the marketing website.
 *
 * INTENT: One place for brand facts, repo coordinates and edition metadata.
 * DECISION: `editions` is an array so a future freemium/paid tier is a data
 *           change, not a redesign — pricing UI renders whatever is listed
 *           here and the download flow reads per-edition availability.
 */

export const SITE = {
  nameEn: 'PropManager',
  nameAr: 'مدير العقار',
  /** GitHub coordinates — must match UPDATE_REPO in the desktop app. */
  repoOwner: 'gotoayman4',
  repoName: 'property-management-app',
  repoUrl: 'https://github.com/gotoayman4/property-management-app',
  releasesApi: 'https://api.github.com/repos/gotoayman4/property-management-app/releases/latest',
  releasesUrl: 'https://github.com/gotoayman4/property-management-app/releases',
  issuesUrl: 'https://github.com/gotoayman4/property-management-app/issues',
  contactEmail: 'gotoayman4@gmail.com',
  /** Shown before the GitHub Releases API responds (and as no-JS fallback). */
  fallbackVersion: '1.0.0',
  fallbackReleaseDate: '2026-07-28',
  /** Minimum OS requirement — mirrors MinVersion in the Inno Setup script. */
  requirementsEn: 'Windows 10 (1809) or later, 64-bit',
  requirementsAr: 'ويندوز 10 (1809) أو أحدث، ‏64-بت'
} as const

export interface Edition {
  id: string
  /** null price = free forever. Future paid tiers set a number + period. */
  price: number | null
  available: boolean
}

/**
 * CAVEAT: Exactly one free edition today. Adding entries here lights up the
 * (already designed) multi-edition download layout — see DownloadPage.astro.
 */
export const EDITIONS: readonly Edition[] = [{ id: 'free', price: null, available: true }] as const
