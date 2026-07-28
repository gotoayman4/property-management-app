# Website Deployment (Netlify)

The marketing site lives in `propmanager-website/` (Astro, static output) and
deploys to Netlify automatically. Configuration is in the repo-root
`netlify.toml` — no settings need to be entered manually in the Netlify UI.

## One-Time Setup (GitHub integration)

1. Log in at <https://app.netlify.com> (sign in **with GitHub**).
2. **Add new site → Import an existing project → GitHub**, authorize the
   repository `property-management-app`.
3. Netlify detects `netlify.toml` and pre-fills everything:
   - Base directory: `propmanager-website`
   - Build command: `npm run build`
   - Publish directory: `propmanager-website/dist`
   - Node version: 22
4. Click **Deploy**. Done — every future push deploys automatically.

After the first deploy, set the site name (Site configuration → Change site
name) or attach a custom domain, then update `SITE_URL` in `netlify.toml`
(and `src/config.ts` fallback) to the final URL.

## What Happens Automatically

| Event                      | Result                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Push to `main`             | Production deploy to the site URL                                                                                                          |
| Open/update a pull request | **Deploy preview** at a unique URL, linked in the PR                                                                                       |
| Push to any other branch   | **Branch deploy** (enable under Site configuration → Branches if wanted)                                                                   |
| Publish an app release     | Nothing needed — the download page reads the GitHub API at runtime, and the changelog page re-renders from `CHANGELOG.md` on the next push |

## Environment Variables

The site needs none by default. `astro.config.mjs` resolves the canonical URL
in this order: `SITE_URL` → `DEPLOY_PRIME_URL` (previews) → `URL` (Netlify
production) → hardcoded fallback. Only `SITE_URL` (set in `netlify.toml`)
should change when the domain changes.

## Headers, Caching, Redirects

Defined in `netlify.toml`:

- Security headers on every response (CSP, HSTS, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy)
- `/_astro/*` (fingerprinted CSS/JS/images/fonts): cached 1 year, immutable
- HTML: revalidated on every request (Netlify default) so updates are instant
- `/screenshots/*` → `/` (legacy folder redirect)

## Regenerating Brand Assets

Favicons and the Open Graph image are committed in `propmanager-website/public/`.
If the app icon or branding changes:

```bash
cd propmanager-website
npm run generate:assets   # rebuilds favicon-32/192, apple-touch-icon, og.png
```

## Troubleshooting

| Symptom                               | Fix                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails: `CHANGELOG.md not found` | The site must build inside the full repo clone — never deploy the `propmanager-website` folder alone                                            |
| Download page shows fallback version  | GitHub API rate-limited or release still a draft; the direct releases-page link keeps working                                                   |
| Wrong canonical/sitemap URLs          | `SITE_URL` in `netlify.toml` doesn't match the real domain                                                                                      |
| Stale page after release              | Changelog/version metadata bake in at build time only for the changelog page — push any commit (or trigger "Clear cache and deploy") to rebuild |
