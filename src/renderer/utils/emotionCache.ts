import createCache from '@emotion/cache'
import { prefixer } from 'stylis'
import rtlPlugin from 'stylis-plugin-rtl'

// `compat` is an undocumented Emotion cache option that suppresses the `:first-child` SSR
// warning. It IS supported at runtime (checked by createUnsafeSelectorsAlarm in stylis-plugins)
// but the @emotion/cache TypeScript declarations omit it from the Options interface.
// This is safe in a client-only Electron app (no SSR).
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

export const cacheRtl = createCache({
  key: 'muirtl',
  compat: true,
  stylisPlugins: [prefixer, rtlPlugin]
})
