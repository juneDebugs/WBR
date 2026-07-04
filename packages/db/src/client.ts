import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient as createLibsqlWeb } from '@libsql/client/web'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  libsqlAdapter: any
  dbConnectionMode: string | undefined
}

// Track connection mode for diagnostics. Backed by globalThis because in
// `next dev` each route bundle gets its own instance of this module, while
// the Prisma singleton (and the mode set when it was created) lives in
// whichever instance ran first.
export let dbConnectionMode = globalForPrisma.dbConnectionMode ?? 'unknown'
function setConnectionMode(mode: string) {
  dbConnectionMode = mode
  globalForPrisma.dbConnectionMode = mode
}

function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const isBuilding = process.env.NEXT_PHASE === 'phase-production-build'
  const isVercel = !!process.env.VERCEL

  // During build: always use local SQLite (no Turso)
  if (isBuilding) {
    setConnectionMode('build-phase-sqlite')
    return new PrismaClient()
  }

  // At runtime: connect to Turso if env vars are set.
  //
  // The HTTP client is used everywhere — Vercel serverless AND local dev.
  // The former embedded-replica path for local dev is retired: its dynamic
  // `require('@libsql/client')` compiled to webpackEmptyContext and could
  // never resolve under `next dev` (silently dropping local dev to a stale
  // SQLite file), and once fixed, Turso rejected the 0.8 client's replica
  // sync protocol as deprecated. HTTP everywhere means local dev reads the
  // same live data production serves.
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      if (!globalForPrisma.libsqlAdapter) {
        const libsql = createLibsqlWeb({ url: tursoUrl, authToken: tursoToken })
        globalForPrisma.libsqlAdapter = new PrismaLibSQL(libsql)
        setConnectionMode(isVercel ? 'turso-http' : 'turso-http-dev')
      }
      return new PrismaClient({ adapter: globalForPrisma.libsqlAdapter } as any)
    } catch (e: any) {
      setConnectionMode('turso-failed: ' + (e?.message ?? 'unknown error'))
      console.error('[prisma] CRITICAL: Turso adapter failed:', e?.message, e?.stack)
    }
  }

  // Local dev: use DATABASE_URL (file:./dev.db)
  setConnectionMode(process.env.DATABASE_URL ? 'sqlite: ' + process.env.DATABASE_URL : 'no-database')
  return new PrismaClient({
    log: ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

// Cache singleton in ALL environments (including production)
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma
