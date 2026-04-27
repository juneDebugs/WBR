import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

let prismaInstance: PrismaClient | undefined

function getLocalClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

async function getTursoClient(): Promise<PrismaClient> {
  const { PrismaLibSQL } = await import('@prisma/adapter-libsql/web')
  const { createClient } = await import('@libsql/client/web')
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  const adapter = new PrismaLibSQL(libsql)
  return new PrismaClient({ adapter } as any)
}

function createClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL ?? ''
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // If DATABASE_URL is a file: URL, use local SQLite (dev)
  if (dbUrl.startsWith('file:')) {
    return getLocalClient()
  }

  // If Turso env vars are set, create a sync wrapper
  // The actual async init happens on first query
  if (tursoUrl && tursoToken) {
    // For the initial creation, we need a sync return
    // Use the Turso client via require (works in Node.js serverless)
    try {
      const adapterMod = require('@prisma/adapter-libsql/web')
      const clientMod = require('@libsql/client/web')
      const libsql = clientMod.createClient({ url: tursoUrl, authToken: tursoToken })
      const adapter = new adapterMod.PrismaLibSQL(libsql)
      return new PrismaClient({ adapter } as any)
    } catch (e: any) {
      console.error('[prisma] Failed to create Turso client:', e?.message)
      return getLocalClient()
    }
  }

  return getLocalClient()
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
