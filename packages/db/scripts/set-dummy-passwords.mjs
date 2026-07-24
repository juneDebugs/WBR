import { createRequire } from 'module'
import { scrypt, randomBytes } from 'crypto'
import { promisify } from 'util'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')

const scryptAsync = promisify(scrypt)
const SCRYPT_N = 4096
const SCRYPT_R = 8
const SCRYPT_P = 1

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
}

function derivePassword(name, email) {
  const base = name
    ? name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    : (email ?? 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  return (base || 'user') + '123'
}

const prisma = new PrismaClient()

// The canonical demo/test accounts must keep their advertised `password123`
// login. This script rewrites every user's password to `firstname123`, which
// silently broke the demo logins in the past — so it now skips them. Keep in
// sync with packages/db/src/test-accounts.ts (CANONICAL_TEST_ACCOUNTS).
const CANONICAL_TEST_EMAILS = new Set(['wbr@test.com', 'stephcurry@test.com', 'sponsor@test.com'])

async function main() {
  const all = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
  const users = all.filter((u) => !CANONICAL_TEST_EMAILS.has((u.email ?? '').toLowerCase()))
  const skipped = all.length - users.length
  console.log(`Setting passwords for ${users.length} users… (skipping ${skipped} canonical test account(s))`)

  let done = 0
  for (const user of users) {
    const plain = derivePassword(user.name, user.email)
    const hashed = await hashPassword(plain)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
    done++
    if (done % 50 === 0) console.log(`  ${done}/${users.length}`)
  }

  console.log(`Done. ${done} passwords set.`)
  console.log(`\nPassword pattern: first name (lowercase) + "123"`)
  console.log(`Examples:`)
  users.slice(0, 5).forEach(u => {
    console.log(`  ${u.email} → ${derivePassword(u.name, u.email)}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
