import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient as createLibsqlWeb } from '@libsql/client/web'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  libsqlAdapter: any
  libsqlClient: any
  replicaSynced: Promise<void> | undefined
}

// Track connection mode for diagnostics
export let dbConnectionMode = 'unknown'

function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const isBuilding = process.env.NEXT_PHASE === 'phase-production-build'
  const isVercel = !!process.env.VERCEL

  // During build: always use local SQLite (no Turso)
  if (isBuilding) {
    dbConnectionMode = 'build-phase-sqlite'
    return new PrismaClient()
  }

  // At runtime: connect to Turso if env vars are set
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      if (!globalForPrisma.libsqlAdapter) {
        if (isVercel) {
          // Vercel serverless: use HTTP client (no native deps needed)
          const libsql = createLibsqlWeb({ url: tursoUrl, authToken: tursoToken })
          globalForPrisma.libsqlAdapter = new PrismaLibSQL(libsql)
          dbConnectionMode = 'turso-http'
        } else {
          // Local / long-lived: embedded replica for local-speed reads
          const mod = '@libsql/client'
          const { createClient: createLibsql } = require(mod)
          const libsql = createLibsql({
            url: 'file:/tmp/turso-replica.db',
            syncUrl: tursoUrl,
            authToken: tursoToken,
            syncInterval: 60,
          })
          // Force initial sync so first reads are never stale.
          // Stored globally so the $extends query guard only blocks until
          // the very first sync completes; subsequent queries are instant.
          globalForPrisma.replicaSynced = libsql.sync()
            .then(() => { console.log('[prisma] Embedded replica synced') })
            .catch((e: any) => console.error('[prisma] Initial replica sync failed:', e?.message))
          globalForPrisma.libsqlAdapter = new PrismaLibSQL(libsql)
          globalForPrisma.libsqlClient = libsql
          dbConnectionMode = 'turso-embedded-replica'
        }
      }

      const raw = new PrismaClient({ adapter: globalForPrisma.libsqlAdapter } as any)

      // Wrap queries: await initial sync before reads, and sync replica after writes
      // so that subsequent reads see the latest data.
      const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'])
      return raw.$extends({
        query: {
          $allModels: {
            async $allOperations({ operation, args, query }: any) {
              if (globalForPrisma.replicaSynced) {
                await globalForPrisma.replicaSynced
              }
              const result = await query(args)
              if (WRITE_OPS.has(operation) && globalForPrisma.libsqlClient) {
                globalForPrisma.libsqlClient.sync().catch(() => {})
              }
              return result
            },
          },
        },
      }) as unknown as PrismaClient
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
