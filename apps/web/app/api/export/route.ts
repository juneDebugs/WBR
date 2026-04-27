import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

function csv(rows: string[][]): string {
  return rows.map(row =>
    row.map(cell => {
      const s = (cell ?? '').toString().replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }).join(',')
  ).join('\r\n')
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  let filename = 'export.csv'
  let data = ''

  if (type === 'agenda') {
    filename = 'agenda.csv'
    const sessions = await prisma.confSession.findMany({
      orderBy: { startsAt: 'asc' },
      include: { speaker: true },
    })
    data = csv([
      ['Title', 'Type', 'Track', 'Room', 'Starts At', 'Ends At', 'Speaker'],
      ...sessions.map(s => [
        s.title,
        s.type,
        s.track ?? '',
        s.room ?? '',
        s.startsAt.toISOString(),
        s.endsAt.toISOString(),
        s.speaker?.name ?? '',
      ]),
    ])
  } else if (type === 'meetings') {
    filename = 'meetings.csv'
    const meetings = await prisma.meeting.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        attendeeA: true,
        attendeeB: true,
        organizer: true,
        timeBlock: true,
      },
    })
    data = csv([
      ['Participant A', 'Email A', 'Participant B', 'Email B', 'Organizer', 'Starts At', 'Ends At', 'Location', 'Status'],
      ...meetings.map(m => [
        m.attendeeA.name ?? '',
        m.attendeeA.email ?? '',
        m.attendeeB.name ?? '',
        m.attendeeB.email ?? '',
        m.organizer?.name ?? '',
        m.timeBlock.startsAt.toISOString(),
        m.timeBlock.endsAt.toISOString(),
        m.timeBlock.location ?? '',
        m.status,
      ]),
    ])
  } else if (type === 'speakers') {
    filename = 'speakers.csv'
    const speakers = await prisma.speaker.findMany({
      orderBy: { name: 'asc' },
      include: { user: true },
    })
    data = csv([
      ['Name', 'Email', 'Company', 'Job Title', 'Bio'],
      ...speakers.map(s => [
        s.name,
        s.user?.email ?? '',
        s.company ?? '',
        s.jobTitle ?? '',
        s.bio ?? '',
      ]),
    ])
  } else if (type === 'attendees') {
    filename = 'attendees.csv'
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { name: true, email: true, company: true, jobTitle: true, role: true, createdAt: true },
    })
    data = csv([
      ['Name', 'Email', 'Company', 'Job Title', 'Role', 'Joined'],
      ...users.map(u => [
        u.name ?? '',
        u.email ?? '',
        u.company ?? '',
        u.jobTitle ?? '',
        u.role,
        u.createdAt.toISOString(),
      ]),
    ])
  } else if (type === 'sponsors') {
    filename = 'sponsors.csv'
    const sponsors = await prisma.sponsor.findMany({
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    })
    data = csv([
      ['Name', 'Tier', 'Contact Name', 'Contact Email', 'Contact Phone', 'Website', 'Booth', 'Company Size', 'Annual Revenue'],
      ...sponsors.map(s => [
        s.name,
        s.tier,
        s.contactName ?? '',
        s.contactEmail ?? '',
        s.contactPhone ?? '',
        s.website ?? '',
        s.boothNumber ?? '',
        s.companySize ?? '',
        s.annualRevenue ?? '',
      ]),
    ])
  } else if (type === 'timeblocks') {
    filename = 'timeblocks.csv'
    const blocks = await prisma.timeBlock.findMany({
      orderBy: { startsAt: 'asc' },
    })
    data = csv([
      ['Starts At', 'Ends At', 'Location', 'Capacity'],
      ...blocks.map(b => [
        b.startsAt.toISOString(),
        b.endsAt.toISOString(),
        b.location ?? '',
        b.capacity.toString(),
      ]),
    ])
  } else {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 })
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
