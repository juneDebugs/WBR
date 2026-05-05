import { prisma } from '@conference/db'

type MeetingRow = {
  id: string; status: string; attendeeAId: string
  startsAt: bigint; endsAt: bigint; location: string | null
  aId: string; aName: string | null; aImage: string | null; aCompany: string | null; aJobTitle: string | null
  bId: string; bName: string | null; bImage: string | null; bCompany: string | null; bJobTitle: string | null
}

type RequestRow = {
  id: string; message: string | null
  rId: string; rName: string | null; rImage: string | null; rCompany: string | null; rJobTitle: string | null
}

type SponsorRow = { id: string; name: string; logoUrl: string | null; tier: string | null }

type SponsorMeetingRow = {
  id: string; notes: string | null
  startsAt: bigint; endsAt: bigint; location: string | null
  uId: string; uName: string | null; uImage: string | null; uCompany: string | null; uJobTitle: string | null
}

type SponsorRequestRow = {
  id: string; status: string; message: string | null
  rId: string; rName: string | null; rImage: string | null; rCompany: string | null; rJobTitle: string | null
  tbStartsAt: bigint | null; tbEndsAt: bigint | null; tbLocation: string | null
}

export async function getAttendeeMeetings(userId: string) {
  const nowMs = BigInt(Date.now())

  const [meetingRows, requestRows] = await Promise.all([
    prisma.$queryRaw<MeetingRow[]>`
      SELECT m.id, m.status, m.attendeeAId,
        tb.startsAt, tb.endsAt, tb.location,
        ua.id as aId, ua.name as aName, ua.image as aImage, ua.company as aCompany, ua.jobTitle as aJobTitle,
        ub.id as bId, ub.name as bName, ub.image as bImage, ub.company as bCompany, ub.jobTitle as bJobTitle
      FROM Meeting m
      JOIN TimeBlock tb ON m.timeBlockId = tb.id
      JOIN User ua ON m.attendeeAId = ua.id
      JOIN User ub ON m.attendeeBId = ub.id
      WHERE (m.attendeeAId = ${userId} OR m.attendeeBId = ${userId})
        AND m.status != 'CANCELLED'
      ORDER BY tb.startsAt ASC`,
    prisma.$queryRaw<RequestRow[]>`
      SELECT mr.id, mr.message,
        u.id as rId, u.name as rName, u.image as rImage,
        u.company as rCompany, u.jobTitle as rJobTitle
      FROM MeetingRequest mr
      JOIN User u ON mr.requesterId = u.id
      WHERE mr.targetUserId = ${userId} AND mr.status = 'PENDING'
      ORDER BY mr.createdAt DESC`,
  ])

  const upcoming: any[] = []
  const past: any[] = []
  for (const m of meetingRows) {
    const other = m.attendeeAId === userId
      ? { id: m.bId, name: m.bName, image: m.bImage, company: m.bCompany, jobTitle: m.bJobTitle }
      : { id: m.aId, name: m.aName, image: m.aImage, company: m.aCompany, jobTitle: m.aJobTitle }
    const entry = {
      id: m.id,
      status: m.status,
      startsAt: new Date(Number(m.startsAt)).toISOString(),
      endsAt: new Date(Number(m.endsAt)).toISOString(),
      location: m.location,
      other,
    }
    if (m.startsAt >= nowMs) upcoming.push(entry)
    else past.push(entry)
  }

  return {
    role: 'ATTENDEE' as const,
    upcoming,
    past,
    incomingRequests: requestRows.map(r => ({
      id: r.id,
      message: r.message,
      requester: { id: r.rId, name: r.rName, image: r.rImage, company: r.rCompany, jobTitle: r.rJobTitle },
    })),
  }
}

export async function getSponsorMeetings(sponsorId: string) {
  const nowMs = BigInt(Date.now())

  const [sponsorRows, meetingRows, requestRows] = await Promise.all([
    prisma.$queryRaw<SponsorRow[]>`
      SELECT id, name, logoUrl, tier FROM Sponsor WHERE id = ${sponsorId} LIMIT 1`,
    prisma.$queryRaw<SponsorMeetingRow[]>`
      SELECT sm.id, sm.notes,
        tb.startsAt, tb.endsAt, tb.location,
        u.id as uId, u.name as uName, u.image as uImage, u.company as uCompany, u.jobTitle as uJobTitle
      FROM SponsorMeeting sm
      JOIN TimeBlock tb ON sm.timeBlockId = tb.id
      JOIN User u ON sm.userId = u.id
      WHERE sm.sponsorId = ${sponsorId} AND sm.status = 'CONFIRMED'
      ORDER BY tb.startsAt ASC`,
    prisma.$queryRaw<SponsorRequestRow[]>`
      SELECT mr.id, mr.status, mr.message,
        u.id as rId, u.name as rName, u.image as rImage, u.company as rCompany, u.jobTitle as rJobTitle,
        tb.startsAt as tbStartsAt, tb.endsAt as tbEndsAt, tb.location as tbLocation
      FROM MeetingRequest mr
      JOIN User u ON mr.requesterId = u.id
      LEFT JOIN TimeBlock tb ON mr.timeBlockId = tb.id
      WHERE mr.targetSponsorId = ${sponsorId} AND mr.status IN ('PENDING', 'APPROVED')
      ORDER BY mr.createdAt DESC`,
  ])

  const upcoming: any[] = []
  const past: any[] = []
  for (const m of meetingRows) {
    const entry = {
      id: m.id,
      startsAt: new Date(Number(m.startsAt)).toISOString(),
      endsAt: new Date(Number(m.endsAt)).toISOString(),
      location: m.location,
      notes: m.notes,
      attendee: { id: m.uId, name: m.uName, image: m.uImage, company: m.uCompany, jobTitle: m.uJobTitle },
    }
    if (m.startsAt >= nowMs) upcoming.push(entry)
    else past.push(entry)
  }

  return {
    role: 'SPONSOR' as const,
    sponsor: sponsorRows[0] ?? null,
    upcoming,
    past,
    inboundRequests: requestRows.map(r => ({
      id: r.id,
      status: r.status,
      message: r.message,
      requester: { id: r.rId, name: r.rName, image: r.rImage, company: r.rCompany, jobTitle: r.rJobTitle },
      timeBlock: r.tbStartsAt != null ? {
        startsAt: new Date(Number(r.tbStartsAt)).toISOString(),
        endsAt: new Date(Number(r.tbEndsAt!)).toISOString(),
        location: r.tbLocation,
      } : null,
    })),
  }
}
