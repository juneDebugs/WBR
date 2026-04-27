import { createRequire } from 'module'
import { scrypt, randomBytes } from 'crypto'
import { promisify } from 'util'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')

const scryptAsync = promisify(scrypt)

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, 64)
  return `${buf.toString('hex')}.${salt}`
}

function derivePassword(name, email) {
  const base = name
    ? name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    : (email ?? 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  return (base || 'user') + '123'
}

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
  console.log(`Setting passwords for ${users.length} users…`)

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
