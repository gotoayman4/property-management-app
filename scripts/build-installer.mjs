/**
 * @file build-installer.mjs — compiles the bilingual Windows installer.
 *
 * INTENT: Single command that turns the electron-builder unpacked output
 *         (dist/win-unpacked) into installer/output/PropManager-{version}-setup.exe
 *         plus a SHA256SUMS.txt integrity manifest consumed by the in-app updater.
 * CONSTRAINT: The version is read ONCE from package.json (single source of truth)
 *         and injected into Inno Setup via /DAppVersion — never hardcoded.
 * CONSTRAINT: Requires Inno Setup >= 6.5 (Arabic.isl became an official language
 *         there). GitHub windows-latest runners ship a compatible version.
 * USAGE:  npm run build:installer        (expects dist/win-unpacked to exist)
 *         npm run dist:win               (full chain: app build → unpack → installer)
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Fail with a plain, actionable message (no stack trace noise for CLI users).
 * @param {string} message
 * @return {never} exits the process
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs build script; return type is declared in the JSDoc above but the rule does not read JSDoc for plain JS files.
function fail(message) {
  console.error(`\n[build-installer] ERROR: ${message}\n`)
  process.exit(1)
}

// --- 1. Version: single source of truth = package.json --------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version "${version}" is not a plain x.y.z version.`)
}

// --- 2. Locate ISCC.exe ----------------------------------------------------
// Order: explicit env override → standard install paths → PATH.
const candidates = [
  process.env.INNO_SETUP_ISCC,
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe'
].filter(Boolean)
let iscc = candidates.find((p) => existsSync(p))
if (!iscc) {
  // Last resort: rely on PATH (GitHub runners expose iscc on PATH too).
  iscc = 'ISCC.exe'
}

// --- 3. Validate prerequisites ---------------------------------------------
const sourceDir = join(root, 'dist', 'win-unpacked')
if (!existsSync(join(sourceDir, 'PropManager.exe'))) {
  fail(
    `Unpacked app not found at ${sourceDir}.\n` +
      'Run "npm run build:unpack" first (electron-vite build + electron-builder --dir).'
  )
}

// Arabic.isl ships with Inno Setup >= 6.5 (official language). Verify when we
// know the compiler directory; when ISCC comes from PATH the compiler itself
// will report a clear missing-file error.
if (iscc !== 'ISCC.exe') {
  const arabicIsl = join(dirname(iscc), 'Languages', 'Arabic.isl')
  if (!existsSync(arabicIsl)) {
    fail(
      `${arabicIsl} not found. The installer requires Inno Setup 6.5+ ` +
        '(Arabic became an official language in 6.5). Please update Inno Setup: ' +
        'https://jrsoftware.org/isdl.php'
    )
  }
}

// --- 4. Compile -------------------------------------------------------------
const issScript = join(root, 'installer', 'windows', 'PropManager.iss')
const outputDir = join(root, 'installer', 'output')
mkdirSync(outputDir, { recursive: true })

console.log(`[build-installer] Compiling installer for PropManager ${version}`)
console.log(`[build-installer] ISCC: ${iscc}`)
try {
  execFileSync(
    iscc,
    [`/DAppVersion=${version}`, `/DAppSourceDir=${sourceDir}`, `/O${outputDir}`, issScript],
    { stdio: 'inherit' }
  )
} catch {
  fail('Inno Setup compilation failed — see compiler output above.')
}

// --- 5. Integrity manifest ---------------------------------------------------
// SHA256SUMS.txt in sha256sum format ("<hex>  <file>") — exactly what
// src/main/services/updateService.ts parseShaSums() expects. The release
// workflow uploads both files as GitHub Release assets.
const setupName = `PropManager-${version}-setup.exe`
const setupPath = join(outputDir, setupName)
if (!existsSync(setupPath)) {
  fail(`Expected output ${setupPath} was not produced.`)
}
const digest = createHash('sha256').update(readFileSync(setupPath)).digest('hex')
writeFileSync(join(outputDir, 'SHA256SUMS.txt'), `${digest}  ${setupName}\n`, 'utf8')

const sizeMb = (readFileSync(setupPath).byteLength / 1024 / 1024).toFixed(1)
console.log(`\n[build-installer] OK: ${setupPath} (${sizeMb} MB)`)
console.log(`[build-installer] SHA-256: ${digest}`)
console.log(`[build-installer] Manifest: ${join(outputDir, 'SHA256SUMS.txt')}`)
