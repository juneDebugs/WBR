const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: false,
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: [
      // Image-class rules listed BEFORE the broader page rule. Workbox
      // evaluates rules in array order and uses the first match — leaving
      // `/_next/image?url=...` URLs to the page rule below shadows the
      // next-image rule entirely (the empty `next-image` cache surfaced
      // during Phase 5 verification confirmed this). Image-class rules use
      // `StaleWhileRevalidate` for instant cache hits + background refresh:
      // new photos appear on the next navigation, which is an acceptable
      // tradeoff vs. a 5–10 s network wait on stalled WiFi.
      //
      // maxEntries: 128 across image caches is deliberate sizing for the
      // conference scale — ~50 speakers + ~30 sessions + ~100 sponsor
      // logos + drill-down avatars ≈ ~250 unique URLs in worst-case
      // browsing; 128 × ~150 KB optimised ≈ 19 MB, well below historical
      // low iOS PWA storage floors and far below current Safari 17+
      // origin quotas (which scale with available device storage), with
      // headroom alongside the `pages` and `workbox-precache` caches.
      // Workbox LRU eviction past the cap is acceptable degradation,
      // not a contract violation.

      // Next.js image optimization (same-origin).
      {
        urlPattern: /\/_next\/image\?url=.+$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-image',
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Cross-origin images (file-extension match).
      {
        urlPattern: ({ url }) => url.origin !== self.location.origin && /\.(?:jpg|jpeg|png|webp|svg)$/i.test(url.pathname),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'cross-origin-images',
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Unsplash specifically — URLs don't end in image extension.
      {
        urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'unsplash-images',
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Google Fonts — listed before the static-assets rule below so
      // cross-origin font CSS hits the long-TTL CacheFirst handler rather
      // than the 24 h SWR handler.
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      // Static assets (JS, CSS) — hashed filenames so SWR is safe. Listed
      // BEFORE the page rule because same-origin `.js`/`.css` would
      // otherwise hit the broad page-rule NetworkFirst handler first and
      // never reach this SWR rule (the same shadow bug Phase 5 fixed for
      // the image-class rules — Codex Round 1 caught the parallel failure
      // here).
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Next.js Pages-Router data payloads. Listed BEFORE the page rule
      // for the same shadow reason. Likely inert under the App Router
      // (RSC traffic does not use `/_next/data/...json`), but the rule is
      // kept ordered correctly so it works if it ever fires. See
      // `recon/perf_phase4_codex_verdicts_2026_06_18.md` §T4.
      {
        urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'next-data',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // App pages: network first with a 5 s timeout so the cache fallback
      // fires before the user is staring at a white screen on conference
      // WiFi. Network-first semantics preserved — stale schedule/meeting
      // state during the live event is worse than slow render. Listed
      // LAST among the same-origin rules so the more-specific rules above
      // get first-match priority.
      {
        urlPattern: ({ url }) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

module.exports = withPWA({
  reactStrictMode: true,
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@prisma/adapter-libsql', '@libsql/client', 'libsql'],
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/sponsors/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'randomuser.me' },
      { protocol: 'https', hostname: 'github.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'agcdn-1d97e.kxcdn.com' },
      { protocol: 'https', hostname: 'encrypted-tbn0.gstatic.com' },
    ],
  },
})
