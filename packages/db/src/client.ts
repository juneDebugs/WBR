import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL ?? ''
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // Production (Vercel): Turso via web adapter — pure JS, no native modules
  if (tursoUrl && tursoToken && !dbUrl.startsWith('file:')) {
    try {
      const { PrismaLibSQL } = require('@prisma/adapter-libsql/web')
      const { createClient } = require('@libsql/client/web')
      const libsql = createClient({ url: tursoUrl, authToken: tursoToken })
      const adapter = new PrismaLibSQL(libsql)
      return new PrismaClient({ adapter } as any)
    } catch {
      // Fallback to standard client
    }
  }

  // Development / build: local SQLite file
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
