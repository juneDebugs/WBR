import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const isBuilding = process.env.NEXT_PHASE === 'phase-production-build'

  // During build: always use local SQLite (no Turso)
  if (isBuilding) {
    return new PrismaClient()
  }

  // At runtime: use Turso if env vars are set
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient: createLibsql } = require('@libsql/client/web')
    const libsql = createLibsql({ url: tursoUrl, authToken: tursoToken })
    const adapter = new PrismaLibSQL(libsql)
    console.log('[prisma] Using Turso adapter:', tursoUrl.replace(/\/\/.*@/, '//***@'))
    return new PrismaClient({ adapter } as any)
  }

  // Local dev: use DATABASE_URL (file:./dev.db)
  if (process.env.DATABASE_URL) {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
  }

  // No database configured — fail loudly instead of silently
  console.error('[prisma] FATAL: No database configured. Set TURSO_DATABASE_URL+TURSO_AUTH_TOKEN or DATABASE_URL.')
  return new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
