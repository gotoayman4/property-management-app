/**
 * INTENT: Build-time check that ar.json and en.json have identical key structures.
 *         NFR-I18N-03 requires key parity between all locale files.
 * USAGE: node scripts/check-i18n-parity.js
 */
const fs = require('fs')
const path = require('path')

const localesDir = path.join(__dirname, '..', 'src', 'renderer', 'locales')

function getKeys(obj, prefix = '') {
  const keys = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getKeys(obj[key], fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

const arPath = path.join(localesDir, 'ar.json')
const enPath = path.join(localesDir, 'en.json')

const ar = JSON.parse(fs.readFileSync(arPath, 'utf-8'))
const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'))

const arKeys = new Set(getKeys(ar))
const enKeys = new Set(en ? getKeys(en) : [])

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k))
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k))

let hasError = false

if (missingInAr.length > 0) {
  console.error(`\x1b[31mMissing in ar.json (${missingInAr.length}):\x1b[0m`)
  missingInAr.forEach((k) => console.error(`  - ${k}`))
  hasError = true
}

if (missingInEn.length > 0) {
  console.error(`\x1b[31mMissing in en.json (${missingInEn.length}):\x1b[0m`)
  missingInEn.forEach((k) => console.error(`  - ${k}`))
  hasError = true
}

if (!hasError) {
  console.log(`\x1b[32m✓ i18n parity check passed (${arKeys.size} keys in both files)\x1b[0m`)
} else {
  console.error(`\n\x1b[31mi18n parity check FAILED\x1b[0m`)
  process.exit(1)
}
