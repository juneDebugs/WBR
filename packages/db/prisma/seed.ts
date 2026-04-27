import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Conference
  const conf = await prisma.conference.upsert({
    where: { id: 'conf-2025' },
    update: {},
    create: {
      id: 'conf-2025',
      name: 'WBR 2027',
      description: 'The premier technology conference of the year.',
      startDate: new Date('2027-04-07T09:00:00Z'),
      endDate: new Date('2027-04-08T18:00:00Z'),
      venue: 'Convention Center, San Francisco',
      active: true,
    },
  })

  // Speakers
  const speakers = await Promise.all([
    prisma.speaker.upsert({
      where: { id: 'spk-1' },
      update: {},
      create: {
        id: 'spk-1',
        conferenceId: conf.id,
        name: 'Sarah Chen',
        bio: 'Sarah is a principal engineer at a major cloud provider with 12 years of experience building distributed systems. She is a frequent speaker at industry conferences and a contributor to several open-source projects.',
        company: 'CloudScale Inc.',
        jobTitle: 'Principal Engineer',
        twitterHandle: '@sarahchen',
        photoUrl: 'https://i.pravatar.cc/150?img=47',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-2' },
      update: {},
      create: {
        id: 'spk-2',
        conferenceId: conf.id,
        name: 'Marcus Williams',
        bio: 'Marcus leads the AI/ML platform team and has published research on large language models. Previously at Google Brain and OpenAI.',
        company: 'DeepTech Labs',
        jobTitle: 'Head of AI Platform',
        linkedinUrl: 'https://linkedin.com/in/marcuswilliams',
        photoUrl: 'https://i.pravatar.cc/150?img=12',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-3' },
      update: {},
      create: {
        id: 'spk-3',
        conferenceId: conf.id,
        name: 'Priya Patel',
        bio: 'Priya is the CTO of a fast-growing fintech startup. She is passionate about developer experience, platform engineering, and building engineering cultures that scale.',
        company: 'FinFlow',
        jobTitle: 'CTO',
        twitterHandle: '@priyapatel_dev',
        photoUrl: 'https://i.pravatar.cc/150?img=48',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-4' },
      update: {},
      create: {
        id: 'spk-4',
        conferenceId: conf.id,
        name: 'James Okafor',
        bio: 'James is a security researcher and ethical hacker who helps companies find and fix vulnerabilities before attackers do. He runs a popular security podcast.',
        company: 'SecureFoundry',
        jobTitle: 'Security Researcher',
        photoUrl: 'https://i.pravatar.cc/150?img=15',
      },
    }),
  ])

  // Sessions — Day 1
  const day1 = '2025-09-15'
  const day2 = '2025-09-16'

  const sessions = await Promise.all([
    prisma.confSession.upsert({
      where: { id: 'ses-1' },
      update: {},
      create: {
        id: 'ses-1',
        conferenceId: conf.id,
        title: 'Opening Keynote: The Future of Cloud-Native Development',
        description: 'A look at where distributed systems are heading and what developers need to know.',
        speakerId: speakers[0].id,
        room: 'Main Hall',
        startsAt: new Date(`${day1}T09:00:00Z`),
        endsAt: new Date(`${day1}T10:00:00Z`),
        type: 'KEYNOTE',
        track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-2' },
      update: {},
      create: {
        id: 'ses-2',
        conferenceId: conf.id,
        title: 'Building LLM Applications at Scale',
        description: 'Practical patterns for integrating large language models into production systems.',
        speakerId: speakers[1].id,
        room: 'Room A',
        startsAt: new Date(`${day1}T10:30:00Z`),
        endsAt: new Date(`${day1}T11:30:00Z`),
        type: 'TALK',
        track: 'AI/ML',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-3' },
      update: {},
      create: {
        id: 'ses-3',
        conferenceId: conf.id,
        title: 'Platform Engineering: From Pain to Product',
        description: 'How to turn your internal developer platform into something teams actually want to use.',
        speakerId: speakers[2].id,
        room: 'Room B',
        startsAt: new Date(`${day1}T10:30:00Z`),
        endsAt: new Date(`${day1}T11:30:00Z`),
        type: 'TALK',
        track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-4' },
      update: {},
      create: {
        id: 'ses-4',
        conferenceId: conf.id,
        title: 'Lunch Break',
        room: 'Atrium',
        startsAt: new Date(`${day1}T12:00:00Z`),
        endsAt: new Date(`${day1}T13:00:00Z`),
        type: 'BREAK',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-5' },
      update: {},
      create: {
        id: 'ses-5',
        conferenceId: conf.id,
        title: 'Attacking Modern Web Applications',
        description: 'A hands-on workshop covering OWASP Top 10 and modern attack vectors.',
        speakerId: speakers[3].id,
        room: 'Workshop Room',
        startsAt: new Date(`${day1}T13:00:00Z`),
        endsAt: new Date(`${day1}T15:00:00Z`),
        type: 'WORKSHOP',
        track: 'Security',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-6' },
      update: {},
      create: {
        id: 'ses-6',
        conferenceId: conf.id,
        title: 'Day 2 Keynote: Engineering at Scale',
        description: 'Lessons learned from scaling a fintech platform to millions of users.',
        speakerId: speakers[2].id,
        room: 'Main Hall',
        startsAt: new Date(`${day2}T09:00:00Z`),
        endsAt: new Date(`${day2}T10:00:00Z`),
        type: 'KEYNOTE',
        track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-7' },
      update: {},
      create: {
        id: 'ses-7',
        conferenceId: conf.id,
        title: 'Zero Trust Architecture in Practice',
        description: 'Implementing zero-trust security models without grinding your engineering team to a halt.',
        speakerId: speakers[3].id,
        room: 'Room A',
        startsAt: new Date(`${day2}T10:30:00Z`),
        endsAt: new Date(`${day2}T11:30:00Z`),
        type: 'TALK',
        track: 'Security',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-8' },
      update: {},
      create: {
        id: 'ses-8',
        conferenceId: conf.id,
        title: 'Fine-Tuning LLMs for Domain-Specific Tasks',
        description: 'A deep-dive into fine-tuning strategies, evaluation, and deployment.',
        speakerId: speakers[1].id,
        room: 'Room B',
        startsAt: new Date(`${day2}T10:30:00Z`),
        endsAt: new Date(`${day2}T11:30:00Z`),
        type: 'TALK',
        track: 'AI/ML',
      },
    }),
  ])

  // Time blocks: 30-min increments, 11am–4pm San Francisco time (PDT = UTC-7 in September).
  // 11:00 AM PDT = T18:00Z … 3:30 PM PDT = T22:30Z (last block ends 4:00 PM PDT = T23:00Z).
  // App formatters use timeZone:'America/Los_Angeles' so display is always correct
  // regardless of where the server or browser runs — no hydration mismatch.
  const tbDays = ['2025-09-15', '2025-09-16']
  // UTC hours (PDT = UTC-7, add 7 to local hour)
  const tbSlots: [number, number][] = [
    [18, 0], [18, 30],   // 11:00, 11:30 AM PDT
    [19, 0], [19, 30],   // 12:00, 12:30 PM PDT
    [20, 0], [20, 30],   //  1:00,  1:30 PM PDT
    [21, 0], [21, 30],   //  2:00,  2:30 PM PDT
    [22, 0], [22, 30],   //  3:00,  3:30 PM PDT
  ]

  await prisma.timeBlock.deleteMany({ where: { conferenceId: conf.id } })

  const timeBlocks = await Promise.all(
    tbDays.flatMap((day, dayIdx) =>
      tbSlots.map(([h, m], slotIdx) => {
        const id = `tb-d${dayIdx + 1}-s${slotIdx + 1}`
        const pad = (n: number) => String(n).padStart(2, '0')
        const endM = m + 30
        const endH = endM >= 60 ? h + 1 : h
        const startsAt = new Date(`${day}T${pad(h)}:${pad(m)}:00.000Z`)
        const endsAt   = new Date(`${day}T${pad(endH)}:${pad(endM % 60)}:00.000Z`)
        return prisma.timeBlock.upsert({
          where: { id },
          update: { startsAt, endsAt },
          create: { id, conferenceId: conf.id, startsAt, endsAt, location: 'Networking Lounge', capacity: 1 },
        })
      })
    )
  )

  // General chat channel
  await prisma.chatRoom.upsert({
    where: { id: 'room-general' },
    update: {},
    create: {
      id: 'room-general',
      name: 'General',
      type: 'CHANNEL',
    },
  })

  console.log('✅ Seed complete')
  console.log(`   Conference: ${conf.name}`)
  console.log(`   Speakers: ${speakers.length}`)
  console.log(`   Sessions: ${sessions.length}`)
  console.log(`   Time blocks: ${timeBlocks.length}`)
  console.log(`   Chat: General channel created`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
