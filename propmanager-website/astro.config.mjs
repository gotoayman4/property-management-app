// @ts-check
/**
 * @file Astro configuration for the PropManager marketing site.
 *
 * INTENT: Fully static, zero-JS-by-default bilingual site. Arabic is the
 *         primary locale served at "/", English lives under "/en/".
 * CONSTRAINT: `site` must be the production URL for correct sitemap +
 *         canonical/hreflang tags. Netlify injects URL/DEPLOY_PRIME_URL at
 *         build time, so previews get correct absolute URLs automatically.
 */
import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

const site =
  process.env.SITE_URL ||
  process.env.DEPLOY_PRIME_URL ||
  process.env.URL ||
  'https://propmanager-app.netlify.app'

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  i18n: {
    locales: ['ar', 'en'],
    defaultLocale: 'ar',
    routing: {
      prefixDefaultLocale: false
    }
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'ar',
        locales: { ar: 'ar', en: 'en' }
      }
    })
  ]
})
