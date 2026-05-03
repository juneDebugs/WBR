const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: false,
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: [
      // App pages: always try network first so data is fresh
      {
        urlPattern: ({ url }) => url.origin === self.location.origin && !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Next.js image optimization: network first to pick up new photos
      {
        urlPattern: /\/_next\/image\?url=.+$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'next-image',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Next.js RSC/data payloads: network first so speaker data is always fresh
      {
        urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'next-data',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Cross-origin images (Unsplash): network first
      {
        urlPattern: ({ url }) => url.origin !== self.location.origin && /\.(?:jpg|jpeg|png|webp|svg)$/i.test(url.pathname),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'cross-origin-images',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Unsplash specifically (URLs don't end in image extension)
      {
        urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'unsplash-images',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      // Static assets (JS, CSS) — safe to cache-first since they have hashed filenames
      {
        urlPattern: /\.(?:js|css)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
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
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@prisma/adapter-libsql'],
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
