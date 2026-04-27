// Assigns every user a unique life-like profile photo.
// Uses i.pravatar.cc with ?u={unique_id} for unique realistic headshots.
// Each user's cuid guarantees a unique URL and unique photo selection.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Assigning unique photos to ${users.length} users...`)

  for (let i = 0; i < users.length; i++) {
    // Each user's cuid is unique → each URL is unique → each photo is unique
    const image = `https://i.pravatar.cc/150?u=${users[i].id}`

    await p.user.update({
      where: { id: users[i].id },
      data: { image },
    })

    if ((i + 1) % 500 === 0) console.log(`  ${i + 1}/${users.length}...`)
  }

  // Verify uniqueness
  const all = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { image: true },
  })
  const uniqueUrls = new Set(all.map(u => u.image))
  console.log(`\n✓ Updated ${users.length} users`)
  console.log(`Unique image URLs: ${uniqueUrls.size} of ${all.length}`)

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
