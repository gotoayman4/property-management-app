/**
 * @file robots.txt — generated at build so the Sitemap URL always matches
 *       the deploy's site origin (production vs. deploy preview).
 */
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site)
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap.href}\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
