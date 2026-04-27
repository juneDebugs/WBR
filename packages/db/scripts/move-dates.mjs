import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')

const p = new PrismaClient()

async function run() {
  const sessions = await p.confSession.findMany({ select: { id: true, startsAt: true, endsAt: true }, orderBy: { startsAt: 'asc' } })
  const blocks = await p.timeBlock.findMany({ select: { id: true, startsAt: true, endsAt: true }, orderBy: { startsAt: 'asc' } })

  const half = Math.floor(sessions.length / 2)
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]
    const targetDay = i < half ? 7 : 8
    const orig = new Date(s.startsAt)
    const start = new Date(orig)
    start.setFullYear(2026, 3, targetDay) // April = month 3
    const dur = new Date(s.endsAt).getTime() - orig.getTime()
    const end = new Date(start.getTime() + dur)
    await p.confSession.update({ where: { id: s.id }, data: { startsAt: start, endsAt: end } })
  }
  console.log(`Sessions: ${sessions.length} moved (${half} → Apr 7, ${sessions.length - half} → Apr 8)`)

  const half2 = Math.floor(blocks.length / 2)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const targetDay = i < half2 ? 7 : 8
    const orig = new Date(b.startsAt)
    const start = new Date(orig)
    start.setFullYear(2026, 3, targetDay)
    const dur = new Date(b.endsAt).getTime() - orig.getTime()
    const end = new Date(start.getTime() + dur)
    await p.timeBlock.update({ where: { id: b.id }, data: { startsAt: start, endsAt: end } })
  }
  console.log(`TimeBlocks: ${blocks.length} moved (${half2} → Apr 7, ${blocks.length - half2} → Apr 8)`)

  await p.$disconnect()
}

run().catch(e => { console.error(e); process.exit(1) })
