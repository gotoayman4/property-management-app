/* eslint-disable */
/**
 * One-shot migration script: replace console.error/console.warn in src/main with logger calls.
 * Run once, then delete. NOT shipped.
 *
 * Patterns handled:
 *   console.error('Label:', error)            -> logger.error('Label', error)
 *   console.error('Label:', a, b)             -> logger.error('Label', [a, b])
 *   console.error('[ns:verb]', error)         -> logger.error('ns:verb', error)
 *   if (isDev) console.error('Label:', error) -> logger.error('Label', error)   (logger gates internally)
 *   console.warn('Label:', x)                 -> logger.warn('Label', 'Label' stripped)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'src', 'main')

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      out.push(...walk(p))
    } else if (e.name.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

let totalReplacements = 0
const filesTouched = []

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')
  let changed = src
  let count = 0

  // Pattern A: if (isDev) console.error('Label:', rest...)  AND  if (isDev) console.error('Label', rest...)
  // Capture label (quoted) and the rest of the args, then rebuild as logger.error(label, rest).
  // Also strip the trailing ':' from the label.
  changed = changed.replace(
    /\bif \(isDev\) console\.(error|warn)\((['"][^'"]*['"])(\s*,\s*([^)]+))?\)/g,
    (match, level, labelQuoted, _commaPart, rest) => {
      const label = labelQuoted.replace(/^['"]/, '').replace(/['"]$/, '').replace(/:$/, '')
      const restStr = rest ? `, ${rest.trim()}` : ''
      count++
      return `logger.${level}('${label}'${restStr})`
    }
  )

  // Pattern B: bare console.error('Label:', rest...)  /  console.error('[ns]', rest...)
  changed = changed.replace(
    /\bconsole\.(error|warn)\((['"][^'"]*['"])(\s*,\s*([^)]+))?\)/g,
    (match, level, labelQuoted, _commaPart, rest) => {
      const labelRaw = labelQuoted.replace(/^['"]/, '').replace(/['"]$/, '')
      // Strip trailing colon, and surrounding [ ] if present ([ns:verb] -> ns:verb)
      const label = labelRaw.replace(/:$/, '').replace(/^\[|\]$/g, '')
      const restStr = rest ? `, ${rest.trim()}` : ''
      count++
      return `logger.${level}('${label}'${restStr})`
    }
  )

  if (count > 0) {
    // Add the import if not present.
    if (!changed.includes("from '../utils/logger'") && !changed.includes("from '../../utils/logger'")) {
      // Determine relative depth from src/main/utils/logger
      const fileDir = path.dirname(file)
      const rel = path.relative(fileDir, path.join(ROOT, 'utils', 'logger')).replace(/\\/g, '/')
      // Insert import after the last existing import line.
      changed = changed.replace(
        /^(import .+;\s*\n(?:import .+;\s*\n)*)/m,
        (head) => `${head}import { logger } from '${rel}'\n`
      )
    }
    fs.writeFileSync(file, changed, 'utf8')
    totalReplacements += count
    filesTouched.push(`${path.relative(ROOT, file)} (${count})`)
  }
}

console.log(`Replaced ${totalReplacements} console calls across ${filesTouched.length} files:`)
for (const f of filesTouched) console.log('  ' + f)
