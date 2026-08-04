/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@conference/db'],
  serverExternalPackages: ['@prisma/adapter-libsql', '@libsql/client', 'libsql'],
  // ── The seeded map pictures must be shipped, and nothing imports them ───────
  //
  // Phase 11, finding F-19. The organizer's map-picture address reads the three
  // seeded floor-plan pictures out of apps/web/assets/maps at request time,
  // because a seeded map stores a file path rather than the picture itself.
  //
  // No source file imports those pictures, so Next's dependency tracing cannot
  // see them and would leave them out of the deployed function. The pictures
  // would then appear on the engineering machine and be absent in production,
  // with nothing failing and nothing logged — the same class of fault findings
  // F-16 and F-17 record, where configuration looked correct locally and had
  // never worked in production. Naming them here is what makes them ship.
  //
  // They live in assets/ rather than public/ on purpose: a file under public/ is
  // routable, and the middleware's matcher decides what skips the signed-in
  // check by naming folders explicitly. Keeping them out of public/ means the
  // pictures are reachable only through the guarded address, and the matcher
  // needs no change.
  outputFileTracingIncludes: {
    '/api/floor-plan/maps/[id]/image': ['./assets/maps/**'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'randomuser.me' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'github.com' },
      { protocol: 'https', hostname: 'www.yotpo.com' },
      { protocol: 'https', hostname: 'www.extensiv.com' },
      { protocol: 'https', hostname: 'www.rebuyengine.com' },
    ],
  },
}
