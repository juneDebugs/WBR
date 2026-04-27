// Updates all ATTENDEE/SPEAKER users to use randomuser.me portrait photos.
// randomuser.me has /portraits/men/0-99.jpg and /portraits/women/0-99.jpg = 200 unique photos.
// We cycle through all 200 for variety.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Assigning realistic photos to ${users.length} users...`)

  for (let i = 0; i < users.length; i++) {
    // Alternate men/women, cycle through 0-99 for each
    const photoIdx = Math.floor(i / 2) % 100
    const gender = i % 2 === 0 ? 'men' : 'women'
    const image = `https://randomuser.me/api/portraits/${gender}/${photoIdx}.jpg`

    await p.user.update({
      where: { id: users[i].id },
      data: { image },
    })

    if ((i + 1) % 500 === 0) console.log(`  ${i + 1}/${users.length}...`)
  }

  console.log(`✓ Updated ${users.length} users with realistic photos`)
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
