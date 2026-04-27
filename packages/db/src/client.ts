import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // Always prefer Turso if both env vars are set (production on Vercel)
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql/web')
    const { createClient: createLibsql } = require('@libsql/client/web')
    const libsql = createLibsql({ url: tursoUrl, authToken: tursoToken })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter } as any)
  }

  // Local dev: use DATABASE_URL (file:./dev.db)
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
