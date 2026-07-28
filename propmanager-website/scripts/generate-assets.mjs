/**
 * @file Generates the favicon set and Open Graph image into public/ from
 *       src/assets/icon.png using sharp.
 *
 * INTENT: BaseLayout references /favicon-32.png, /favicon-192.png,
 *         /apple-touch-icon.png and /og.png — this script produces them.
 * CAVEAT: Run manually (`npm run generate:assets`) whenever the app icon or
 *         brand changes; outputs are committed so Netlify builds stay fast
 *         and deterministic.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconPath = join(root, 'src', 'assets', 'icon.png')
const outDir = join(root, 'public')
mkdirSync(outDir, { recursive: true })

/** Favicon sizes → output file names. */
const favicons = [
  { size: 32, name: 'favicon-32.png' },
  { size: 192, name: 'favicon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' }
]

for (const { size, name } of favicons) {
  await sharp(iconPath).resize(size, size).png().toFile(join(outDir, name))
  console.log(`✔ ${name} (${size}×${size})`)
}

/*
 * OG image (1200×630): dark "ledger" card — ink background, ruled lines,
 * crimson margin rule, centered icon and bilingual wordmark.
 * DECISION: Composed as SVG + icon overlay so the image is generated from
 * the same brand tokens as the site (no design-tool dependency).
 */
const W = 1200
const H = 630
const lineGap = 44

/** Horizontal ledger rules as SVG lines. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs build script; returns string (see JSDoc); rule cannot read JSDoc in plain JS
const rules = () => {
  let s = ''
  for (let y = lineGap; y < H; y += lineGap) {
    s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ece5da" stroke-opacity="0.06" stroke-width="1"/>`
  }
  return s
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#14110d"/>
  ${rules()}
  <line x1="96" y1="0" x2="96" y2="${H}" stroke="#e06c6c" stroke-opacity="0.4" stroke-width="2"/>
  <text x="600" y="392" text-anchor="middle" font-family="Segoe UI, Tahoma, Arial" font-size="72" font-weight="700" fill="#ece5da">مدير العقار — PropManager</text>
  <text x="600" y="452" text-anchor="middle" font-family="Segoe UI, Tahoma, Arial" font-size="30" fill="#a89e91">Your properties. Your ledger. Your device.</text>
  <text x="600" y="540" text-anchor="middle" font-family="Consolas, monospace" font-size="22" fill="#e5a13d">Free · Offline · Windows</text>
</svg>`

const icon = await sharp(iconPath).resize(160, 160).png().toBuffer()
await sharp(Buffer.from(svg))
  .composite([{ input: icon, top: 96, left: 520 }])
  .png()
  .toFile(join(outDir, 'og.png'))
console.log('✔ og.png (1200×630)')
