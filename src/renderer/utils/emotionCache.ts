import createCache from '@emotion/cache'
import { prefixer } from 'stylis'
import rtlPlugin from 'stylis-plugin-rtl'

// DECISION: Use `compat: true` instead of removing stylis-plugin-rtl or disabling the warning.
//   `compat` suppresses the Emotion SSR `:first-child`/`:nth-child` pseudo-class alarm
//   (`createUnsafeSelectorsAlarm`). Safe in a client-only Electron app (no SSR).
// CAVEAT: @emotion/cache v11.14 accepts `compat` in createCache options but does NOT
//   propagate it to the returned cache object. The alarm getter reads `cache.compat` which
//   stays `undefined`, so the warning fires regardless. We assign compat explicitly after
//   creation as a workaround. This is a known Emotion bug fixed in later versions.
declare module '@emotion/cache' {
  interface Options {
    compat?: boolean
  }
}

export const cacheLtr = createCache({
  key: 'muiltr',
  compat: true,
  stylisPlugins: [prefixer]
})
cacheLtr.compat = true

export const cacheRtl = createCache({
  key: 'muirtl',
  compat: true,
  stylisPlugins: [prefixer, rtlPlugin]
})
cacheRtl.compat = true
