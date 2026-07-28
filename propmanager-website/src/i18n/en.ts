/**
 * @file English UI strings for the marketing site.
 * CONSTRAINT: Must stay shape-identical to ar.ts — TypeScript enforces it via
 *             the Dictionary type in index.ts (ar.ts is the source of truth).
 */

export const en = {
  meta: {
    siteTitle: 'PropManager — Property management that lives on your device',
    siteDescription:
      'A free, offline, Arabic-first desktop app for managing properties, contracts, tenants and finances. Your data never leaves your computer.'
  },
  nav: {
    home: 'Home',
    features: 'Features',
    download: 'Download',
    changelog: 'Changelog',
    contact: 'Contact',
    skip: 'Skip to content',
    theme: 'Toggle color theme',
    language: 'العربية',
    languageHref: 'switch to Arabic',
    menu: 'Menu'
  },
  hero: {
    kicker: 'Ledger № 01 — Free for Windows',
    title1: 'Your properties.',
    titleAccent: 'Your ledger.',
    title2: 'Your device.',
    sub: 'PropManager keeps buildings, tenants, contracts and every fils of rent in one meticulous offline ledger — no cloud, no subscription, no one reading your numbers.',
    ctaPrimary: 'Download for Windows',
    ctaSecondary: 'Explore features',
    free: '100% free',
    offline: 'Works fully offline',
    bilingual: 'Arabic & English',
    screenshotAlt: 'PropManager dashboard showing portfolio KPIs, dark theme'
  },
  ledgerStrip: {
    entries: [
      'Immutable ledger',
      'Multi-currency',
      'Excel reports',
      'Verified backups',
      'Contract alerts',
      'Dark mode',
      'RTL native'
    ]
  },
  features: {
    label: 'The register',
    title: 'Everything a landlord writes down — done properly',
    sub: 'Eight tools, one ledger. Each entry recorded once, correctly, forever.',
    items: [
      {
        title: 'Properties & units',
        desc: 'Buildings, apartments, shops — statuses, default rents and occupancy at a glance.'
      },
      {
        title: 'Contracts & tenants',
        desc: 'Full tenancy records with start, end, deposits and renewal tracking.'
      },
      {
        title: 'An honest ledger',
        desc: 'Entries are immutable. Corrections are reversals — exactly like real accounting.'
      },
      {
        title: 'Multi-currency',
        desc: 'Record in your base currency, view in others with managed exchange rates.'
      },
      {
        title: 'Reports & Excel',
        desc: 'Income, arrears and occupancy reports that export to Excel in one click.'
      },
      {
        title: 'Verified backups',
        desc: 'One-click encrypted backups with integrity checks and easy restore.'
      },
      {
        title: 'Smart reminders',
        desc: 'Contract expiry and payment notifications before they become problems.'
      },
      {
        title: 'Arabic-first, truly',
        desc: 'Native RTL layout, Arabic typography and a full English mode — not a translation bolted on.'
      }
    ]
  },
  privacy: {
    label: 'Why offline',
    title: 'Your numbers are nobody’s business',
    points: [
      {
        title: 'Data stays home',
        desc: 'Everything lives in a local database on your PC. No servers, no accounts, no telemetry.'
      },
      {
        title: 'No subscription mathematics',
        desc: 'Free today, and your data is never held hostage behind a paywall.'
      },
      {
        title: 'Works in the basement',
        desc: 'No internet? Nothing changes. The only optional network calls are exchange rates and update checks.'
      },
      {
        title: 'Leaves with you',
        desc: 'Backups are portable files. Move machines whenever you like — restore and continue.'
      }
    ]
  },
  gallery: {
    label: 'On paper',
    title: 'Designed like a fine ledger, light or dark',
    sub: 'The same meticulous interface in Arabic and English, day and night.',
    alts: {
      dashboardDark: 'Dashboard in dark mode',
      dashboardLight: 'Dashboard in light mode',
      reports: 'Financial reports page',
      notifications: 'Notifications centre'
    }
  },
  downloadCta: {
    label: 'Take it home',
    title: 'Install it in under a minute',
    sub: 'One small setup file. Arabic or English installer, your choice.',
    button: 'Download for Windows',
    versionPrefix: 'Version',
    requirements: 'Windows 10 (1809) or later, 64-bit',
    allReleases: 'All releases on GitHub'
  },
  faq: {
    label: 'Questions',
    title: 'Asked and answered',
    items: [
      {
        q: 'Is PropManager really free?',
        a: 'Yes — the full application is free. If paid editions ever appear, the free edition and your data stay yours.'
      },
      {
        q: 'Does it need an internet connection?',
        a: 'No. All features work offline. Internet is only used if you enable online exchange-rate fetching or check for updates.'
      },
      {
        q: 'Where is my data stored?',
        a: 'In a local SQLite database inside your Windows user profile. You can back it up and restore it anywhere.'
      },
      {
        q: 'Is Arabic fully supported?',
        a: 'Arabic is the primary language — full right-to-left layout, Arabic reports and an Arabic installer. English is equally complete.'
      },
      {
        q: 'How do updates work?',
        a: 'The app checks GitHub Releases, downloads the new installer in the background, verifies its integrity, and asks you before installing. Your data is preserved.'
      },
      {
        q: 'Can I move to a new computer?',
        a: 'Yes. Create a backup, install PropManager on the new machine, and restore — everything comes across.'
      },
      {
        q: 'Which platforms are supported?',
        a: 'Windows 10 (1809) and later today. The architecture keeps the door open for other platforms in the future.'
      }
    ]
  },
  featuresPage: {
    title: 'A complete tour of the ledger',
    sub: 'What PropManager does, screen by screen.',
    sections: [
      {
        title: 'One dashboard, the whole portfolio',
        desc: 'Occupancy, collected rent, arrears and expiring contracts — the morning glance that replaces a spreadsheet ritual.',
        bullets: [
          'KPIs for occupancy, income and arrears',
          'Expiring contracts surfaced before they lapse',
          'Bilingual interface with true RTL mirroring'
        ]
      },
      {
        title: 'A ledger that cannot lie',
        desc: 'Every payment, charge and deposit movement is an immutable entry. Mistakes are corrected with reversal entries, so the history always adds up.',
        bullets: [
          'Immutable entries, reversal-based corrections',
          'Atomic transactions for every financial write',
          'Amounts recorded in your base currency'
        ]
      },
      {
        title: 'Currencies without confusion',
        desc: 'Manage exchange rates yourself or fetch them online when you choose. Conversion is display-only — the ledger stays in one honest currency.',
        bullets: [
          'Manual or online exchange rates',
          'Display conversion for any currency',
          'Rate history kept for auditability'
        ]
      },
      {
        title: 'Reports your accountant will accept',
        desc: 'Income statements, arrears lists and occupancy summaries, filterable by property and period, exported to Excel.',
        bullets: [
          'One-click Excel export',
          'Filter by property, unit and period',
          'Arabic and English report layouts'
        ]
      },
      {
        title: 'Reminders before problems',
        desc: 'The notification centre watches contract expiry dates and payment schedules so you do not have to.',
        bullets: [
          'Contract expiry alerts',
          'Payment due reminders',
          'All processed locally on your device'
        ]
      },
      {
        title: 'Backups you can trust',
        desc: 'Scheduled, verified backups with checksums — and a restore flow that has been tested more than any other feature.',
        bullets: [
          'Integrity-verified backup files',
          'Automatic pruning of old backups',
          'Restore to any Windows machine'
        ]
      }
    ]
  },
  downloadPage: {
    title: 'Download PropManager',
    sub: 'Free, offline, bilingual. One installer, both languages.',
    latest: 'Latest version',
    released: 'Released',
    size: 'Size',
    notes: 'Release notes',
    button: 'Download setup.exe',
    loading: 'Fetching the latest release…',
    apiError: 'Could not reach GitHub — the button below still downloads the latest release.',
    directFallback: 'Get it from GitHub Releases',
    verify: 'Verify your download',
    verifyNote:
      'Every release ships a SHA256SUMS.txt file. Compare its value with your file’s checksum:',
    editionTitle: 'Free edition',
    editionDesc:
      'The complete application — every feature listed on this site, no locked screens, no trial timers.',
    editionCta: 'Free forever',
    futurePlatforms: 'Other platforms',
    futurePlatformsNote:
      'PropManager currently ships for Windows. The release pipeline is built to add more platforms when demand justifies them.',
    requirementsTitle: 'System requirements',
    installTitle: 'Installation in three steps',
    installSteps: [
      'Download the setup file below.',
      'Run it — the installer speaks Arabic and English and needs no admin rights.',
      'Open PropManager from the Start menu and add your first property.'
    ]
  },
  changelogPage: {
    title: 'Changelog',
    sub: 'Every release, every change — the ledger of the ledger.',
    current: 'current',
    viewOnGitHub: 'View releases on GitHub'
  },
  contactPage: {
    title: 'Talk to us',
    sub: 'Questions, bug reports, feature ideas — all welcome.',
    emailTitle: 'Email',
    emailDesc: 'For anything: questions, feedback or help.',
    issuesTitle: 'Report a bug',
    issuesDesc: 'Found something broken? Open an issue with the details and we will look into it.',
    issuesCta: 'Open a GitHub issue',
    repoTitle: 'Project page',
    repoDesc: 'Releases, changelog and the roadmap live on GitHub.',
    repoCta: 'Visit the repository',
    responseNote: 'This is an independent project — replies usually arrive within a few days.'
  },
  legal: {
    privacyTitle: 'Privacy Policy',
    termsTitle: 'Terms of Use',
    updated: 'Last updated'
  },
  notFound: {
    title: 'Page not found',
    sub: 'This entry is not in the ledger.',
    back: 'Back to the homepage'
  },
  footer: {
    tagline: 'Property management that lives on your device.',
    product: 'Product',
    resources: 'Resources',
    legal: 'Legal',
    github: 'GitHub',
    releases: 'Releases',
    reportIssue: 'Report an issue',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    rights: 'Free software for landlords who like tidy books.'
  }
}
