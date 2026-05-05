import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient as createLibsql } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  libsqlAdapter: any
}

// Track connection mode for diagnostics
export let dbConnectionMode = 'unknown'

function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const isBuilding = process.env.NEXT_PHASE === 'phase-production-build'

  // During build: always use local SQLite (no Turso)
  if (isBuilding) {
    dbConnectionMode = 'build-phase-sqlite'
    return new PrismaClient()
  }

  // At runtime: use Turso with embedded replica for local-speed reads
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      if (!globalForPrisma.libsqlAdapter) {
        const libsql = createLibsql({
          url: 'file:local-replica.db',
          syncUrl: tursoUrl,
          authToken: tursoToken,
          syncInterval: 60,
        })
        globalForPrisma.libsqlAdapter = new PrismaLibSQL(libsql)
      }
      dbConnectionMode = 'turso-embedded-replica'
      return new PrismaClient({ adapter: globalForPrisma.libsqlAdapter } as any)
    } catch (e: any) {
      dbConnectionMode = 'turso-failed: ' + (e?.message ?? 'unknown error')
      console.error('[prisma] CRITICAL: Turso adapter failed:', e?.message, e?.stack)
    }
  }

  // Local dev: use DATABASE_URL (file:./dev.db)
  dbConnectionMode = process.env.DATABASE_URL ? 'sqlite: ' + process.env.DATABASE_URL : 'no-database'
  return new PrismaClient({
    log: ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

// Cache singleton in ALL environments (including production)
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma
