import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL ?? ''
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // Local dev: DATABASE_URL starts with file:
  if (dbUrl.startsWith('file:')) {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
  }

  // Production: use Turso via web adapter
  if (tursoUrl && tursoToken) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql/web')
    const { createClient: createLibsql } = require('@libsql/client/web')
    const libsql = createLibsql({ url: tursoUrl, authToken: tursoToken })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter } as any)
  }

  // Fallback: standard client (uses DATABASE_URL as-is)
  return new PrismaClient({
    log: ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
