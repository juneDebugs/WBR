// Company-centric meeting engine — pure, prisma-injected scheduling logic.
//
// This module is imported directly (type-stripped) by scripts/test-meeting-engine.mjs,
// so it MUST stay self-contained: no relative imports of sibling modules, no app
// imports. The prisma client is always injected by the caller. Only type-only
// imports (erased at runtime) are allowed.
import type { PrismaClient } from '@prisma/client'

// A loose prisma surface so tests can pass either the real client or a subset.
type Db = PrismaClient

// ── Rooms / tables ──────────────────────────────────────────────────────────
// A sponsor's booth is modeled as a fixed set of tables + a shared lounge.
// Occupancy is scoped per sponsor: the same room can host different sponsors,
// but one sponsor cannot double-book a table in the same time block.
export interface MeetingRoom {
  name: string
  capacity: number
}
export const MEETING_ROOMS: MeetingRoom[] = [
  { name: 'Table 1', capacity: 1 },
  { name: 'Table 2', capacity: 1 },
  { name: 'Table 3', capacity: 1 },
  { name: 'Table 4', capacity: 1 },
  { name: 'Table 5', capacity: 1 },
  { name: 'Table 6', capacity: 1 },
  { name: 'Table 7', capacity: 1 },
  { name: 'Table 8', capacity: 1 },
  { name: 'Networking Lounge', capacity: 4 },
]
export const totalRoomCapacity = MEETING_ROOMS.reduce((s, r) => s + r.capacity, 0)
export function roomByName(name: string | null | undefined): MeetingRoom | null {
  if (!name) return null
  return MEETING_ROOMS.find(r => r.name === name) ?? null
}

// Target number of confirmed meetings per company, used for the fill-rate meter.
export const FILL_TARGET = 10

// ── Priority tiers ────────────────────────────────────────────────────────────
// The requester (attendee or sponsor) tags each meeting request with how strong a
// fit it is. The auto-scheduler fills Best Fit requests first, then Med, then Low.
export type MeetingPriority = 'BEST_FIT' | 'MED' | 'LOW'
export const MEETING_PRIORITIES: MeetingPriority[] = ['BEST_FIT', 'MED', 'LOW']
export function normalizePriority(raw: string | null | undefined): MeetingPriority {
  return raw === 'BEST_FIT' || raw === 'MED' || raw === 'LOW' ? raw : 'MED'
}
// Lower rank schedules first: BEST_FIT (0) → MED (1) → LOW (2).
export function priorityRank(p: MeetingPriority): number {
  return p === 'BEST_FIT' ? 0 : p === 'MED' ? 1 : 2
}
export function priorityLabel(p: MeetingPriority): string {
  return p === 'BEST_FIT' ? 'Best Fit' : p === 'MED' ? 'Med' : 'Low'
}

// ── Interest scoring ────────────────────────────────────────────────────────
export type InterestLevel = 'High' | 'Medium' | 'Low'
export function interestLevel(score: number): InterestLevel {
  if (score >= 67) return 'High'
  if (score >= 34) return 'Medium'
  return 'Low'
}
// eTail shows interest as an n/5 rating (e.g. "Interest Level: 4/5").
export function interestOutOf5(score: number): number {
  const n = Math.round(score / 20)
  return score > 0 && n === 0 ? 1 : n
}

export function parseSolutions(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Ported from the recommendations route's scoreSponsorVsAttendee (solutions only).
// A sponsor "seeking" a solution the user "offers" is the strongest signal (3);
// the reverse (sponsor offers what the user seeks) is secondary (2).
export function scoreSolutionsMatch(
  sponsorSeeking: string[],
  sponsorOffering: string[],
  userOffering: string[],
  userSeeking: string[],
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of sponsorSeeking) {
    if (userOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of sponsorOffering) {
    if (userSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  const maxPossible = sponsorSeeking.length * 3 + sponsorOffering.length * 2
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

// ── Typed engine errors ─────────────────────────────────────────────────────
export type EngineErrorCode =
  | 'REQUEST_NOT_FOUND'
  | 'MEETING_NOT_FOUND'
  | 'NOT_A_SPONSOR_REQUEST'
  | 'BAD_STATUS'
  | 'UNKNOWN_ROOM'
  | 'CANDIDATE_BUSY'
  | 'ROOM_CONFLICT'
  | 'SPONSOR_FULL'
  | 'ALREADY_SCHEDULED'
export class EngineError extends Error {
  code: EngineErrorCode
  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'EngineError'
    this.code = code
  }
}

// ── Party resolution ────────────────────────────────────────────────────────
// A request "belongs" to a sponsor when either the request targets the sponsor
// (an attendee → sponsor ask) or the requester is a rep of the sponsor
// (a sponsor → attendee ask). Returns the non-sponsor user (the candidate).
export interface ResolvedParties {
  sponsorId: string
  userId: string       // the attendee/speaker being met
  repId: string | null // the sponsor rep, when the rep initiated the request
}
interface RequestLike {
  requesterId: string
  targetUserId: string | null
  targetSponsorId: string | null
  requester?: { sponsorId?: string | null } | null
}
export function resolveParties(req: RequestLike): ResolvedParties | null {
  // Precedence: a request that targets a sponsor is always treated as
  // attendee→sponsor (the requester is the candidate), even if the requester
  // also happens to carry a sponsorId. Rep→attendee is only inferred when there
  // is no sponsor target. These two shapes are mutually exclusive in practice.
  if (req.targetSponsorId) {
    return { sponsorId: req.targetSponsorId, userId: req.requesterId, repId: null }
  }
  const repSponsor = req.requester?.sponsorId ?? null
  if (repSponsor && req.targetUserId) {
    return { sponsorId: repSponsor, userId: req.targetUserId, repId: req.requesterId }
  }
  return null
}

// ── Time helpers ────────────────────────────────────────────────────────────
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()
}
function dayKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10) // yyyy-mm-dd (UTC)
}
const DAY_LABEL_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
})
export function dayLabel(d: Date): string {
  return DAY_LABEL_FMT.format(d)
}

async function resolveConferenceId(prisma: Db, conferenceId?: string): Promise<string> {
  if (conferenceId) return conferenceId
  const active = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  return active?.id ?? 'conf-2025'
}

// ── Company directory ───────────────────────────────────────────────────────
export interface DirectoryRow {
  id: string
  name: string
  logoUrl: string | null
  tier: string
  createdAt: string          // Company "Created"
  lastLogin: string | null   // most recent rep activity (proxy)
  numLogins: number          // number of company reps (proxy for login count)
  receiveRequests: boolean   // company accepts meeting requests
  requestsMade: number       // requests this company's reps sent to attendees
  requestsReceived: number   // requests targeting this company
  confirmed: number          // Total Confirmed Meetings
  // Retained for internal use (bank size / fill meter), not eTail columns.
  requests: number
  pending: number
  unscheduled: number
  fillRate: number
}
export async function getCompanyDirectory(prisma: Db, conferenceId?: string): Promise<DirectoryRow[]> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [sponsors, requests, meetings, reps] = await Promise.all([
    prisma.sponsor.findMany({
      where: { conferenceId: confId },
      select: { id: true, name: true, logoUrl: true, tier: true, createdAt: true },
      orderBy: { name: 'asc' },
    }),
    prisma.meetingRequest.findMany({
      where: { status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: {
        requesterId: true, targetUserId: true, targetSponsorId: true, status: true,
        requester: { select: { sponsorId: true } },
      },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      select: { sponsorId: true, userId: true },
    }),
    prisma.user.groupBy({
      by: ['sponsorId'],
      where: { sponsorId: { not: null } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
  ])

  const confirmedBySponsor = new Map<string, number>()
  const scheduledPairs = new Set<string>() // `${sponsorId}::${userId}` with a live meeting
  for (const m of meetings) {
    confirmedBySponsor.set(m.sponsorId, (confirmedBySponsor.get(m.sponsorId) ?? 0) + 1)
    scheduledPairs.add(`${m.sponsorId}::${m.userId}`)
  }

  const repStats = new Map<string, { count: number; lastLogin: Date | null }>()
  for (const r of reps) if (r.sponsorId) repStats.set(r.sponsorId, { count: r._count._all, lastLogin: r._max.updatedAt ?? null })

  const agg = new Map<string, { requests: number; pending: number; unscheduled: number; made: number; received: number }>()
  for (const r of requests) {
    const parties = resolveParties(r)
    if (!parties) continue
    const cur = agg.get(parties.sponsorId) ?? { requests: 0, pending: 0, unscheduled: 0, made: 0, received: 0 }
    cur.requests++
    if (r.targetSponsorId) cur.received++       // attendee → this company
    else cur.made++                             // this company's rep → attendee
    if (r.status === 'PENDING') cur.pending++
    else if (r.status === 'APPROVED' && !scheduledPairs.has(`${parties.sponsorId}::${parties.userId}`)) cur.unscheduled++
    agg.set(parties.sponsorId, cur)
  }

  return sponsors.map(s => {
    const a = agg.get(s.id) ?? { requests: 0, pending: 0, unscheduled: 0, made: 0, received: 0 }
    const confirmed = confirmedBySponsor.get(s.id) ?? 0
    const rep = repStats.get(s.id)
    return {
      id: s.id, name: s.name, logoUrl: s.logoUrl, tier: s.tier,
      createdAt: s.createdAt.toISOString(),
      lastLogin: rep?.lastLogin ? rep.lastLogin.toISOString() : null,
      numLogins: rep?.count ?? 0,
      receiveRequests: true,
      requestsMade: a.made,
      requestsReceived: a.received,
      confirmed,
      requests: a.requests, pending: a.pending, unscheduled: a.unscheduled,
      fillRate: Math.min(1, confirmed / FILL_TARGET),
    }
  })
}

// ── Schedule matrix (per company) ───────────────────────────────────────────
export interface BankItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  message: string | null
  priority: MeetingPriority
  rank: number
  total: number
  interest: InterestLevel
  interestScore: number
  interestOutOf5: number
  matched: string[]
  confirmedCount: number // the candidate's load across all companies
  status: 'Inbound' | 'Approved'
}
export interface PendingItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  message: string | null
  priority: MeetingPriority
  interest: InterestLevel
  interestScore: number
}
// A candidate already scheduled with this company (sidebar "Already Scheduled").
export interface ScheduledItem {
  sponsorMeetingId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  confirmedCount: number
  timeBlockId: string
  room: string | null
}
// A declined/withdrawn request (sidebar "Misc").
export interface MiscItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  status: 'Declined'
}
export interface SlotMeeting {
  sponsorMeetingId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  room: string | null
}
export interface MatrixSlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  meetings: SlotMeeting[]
  capacityLeft: number
}
export interface MatrixDay {
  dayKey: string
  label: string
  slots: MatrixSlot[]
}
export interface ScheduleMatrix {
  sponsor: { id: string; name: string; logoUrl: string | null; tier: string }
  rooms: MeetingRoom[]
  totalRoomCapacity: number
  bank: BankItem[]              // Unscheduled — APPROVED, awaiting a slot
  pending: PendingItem[]        // Unscheduled — PENDING (Inbound)
  alreadyScheduled: ScheduledItem[]
  misc: MiscItem[]              // Declined / withdrawn
  days: MatrixDay[]
  confirmedCount: number
}

export async function getSponsorScheduleMatrix(
  prisma: Db, sponsorId: string, conferenceId?: string,
): Promise<ScheduleMatrix> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const sponsor = await prisma.sponsor.findUnique({
    where: { id: sponsorId },
    select: {
      id: true, name: true, logoUrl: true, tier: true,
      solutionsSeeking: true, solutionsOffering: true,
    },
  })
  if (!sponsor) throw new EngineError('REQUEST_NOT_FOUND', 'Sponsor not found')

  const [timeBlocks, sponsorMeetings, requests] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { sponsorId, status: 'CONFIRMED' },
      select: {
        id: true, userId: true, timeBlockId: true, location: true,
        user: { select: { name: true, company: true, image: true } },
      },
    }),
    prisma.meetingRequest.findMany({
      where: {
        status: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true,
        status: true, message: true, priority: true, createdAt: true,
        requester: {
          select: {
            sponsorId: true, name: true, company: true, image: true,
            solutionsOffering: true, solutionsSeeking: true,
          },
        },
        targetUser: {
          select: {
            name: true, company: true, image: true,
            solutionsOffering: true, solutionsSeeking: true,
          },
        },
      },
    }),
  ])

  const sponsorSeeking = parseSolutions(sponsor.solutionsSeeking)
  const sponsorOffering = parseSolutions(sponsor.solutionsOffering)

  // Score every request for ranking; rank across ALL active requests for the company.
  interface Scored {
    req: (typeof requests)[number]
    parties: ResolvedParties
    userName: string
    company: string | null
    image: string | null
    userOffering: string[]
    userSeeking: string[]
    score: number
    matched: string[]
  }
  const scored: Scored[] = []
  const rejected: Scored[] = []
  for (const req of requests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || parties.sponsorId !== sponsorId) continue
    // The candidate's profile is on whichever side is NOT the sponsor.
    const cand = req.targetSponsorId ? req.requester : req.targetUser
    const userOffering = parseSolutions(cand?.solutionsOffering ?? null)
    const userSeeking = parseSolutions(cand?.solutionsSeeking ?? null)
    const { score, matched } = scoreSolutionsMatch(sponsorSeeking, sponsorOffering, userOffering, userSeeking)
    const entry: Scored = {
      req, parties, userName: cand?.name ?? 'Unknown',
      company: cand?.company ?? null, image: cand?.image ?? null,
      userOffering, userSeeking, score, matched,
    }
    if (req.status === 'REJECTED') rejected.push(entry)
    else scored.push(entry) // PENDING + APPROVED are ranked together
  }
  // Rank reflects the order the auto-scheduler will fill slots: priority tier
  // first (Best Fit → Med → Low), then fit score, then oldest request wins.
  scored.sort((a, b) =>
    priorityRank(normalizePriority(a.req.priority)) - priorityRank(normalizePriority(b.req.priority)) ||
    b.score - a.score ||
    a.req.createdAt.getTime() - b.req.createdAt.getTime())
  const total = scored.length
  const rankByRequestId = new Map<string, number>()
  scored.forEach((s, i) => rankByRequestId.set(s.req.id, i + 1))

  // A user already scheduled with this sponsor is not in the bank.
  const scheduledUserIds = new Set(sponsorMeetings.map(m => m.userId))

  // Load per-candidate confirmed-meeting counts (their load, across all companies).
  const candidateIds = Array.from(new Set([
    ...scored.map(s => s.parties.userId),
    ...sponsorMeetings.map(m => m.userId),
  ]))
  const loadCounts = candidateIds.length
    ? await prisma.sponsorMeeting.groupBy({
        by: ['userId'],
        where: { status: 'CONFIRMED', userId: { in: candidateIds } },
        _count: { _all: true },
      })
    : []
  const loadByUser = new Map<string, number>()
  for (const l of loadCounts) loadByUser.set(l.userId, l._count._all)

  const bank: BankItem[] = []
  const pending: PendingItem[] = []
  for (const s of scored) {
    if (s.req.status === 'PENDING') {
      pending.push({
        requestId: s.req.id, userId: s.parties.userId, name: s.userName,
        company: s.company, image: s.image, message: s.req.message,
        priority: normalizePriority(s.req.priority),
        interest: interestLevel(s.score), interestScore: s.score,
      })
      continue
    }
    // APPROVED
    if (scheduledUserIds.has(s.parties.userId)) continue // already has a meeting
    bank.push({
      requestId: s.req.id, userId: s.parties.userId, name: s.userName,
      company: s.company, image: s.image, message: s.req.message,
      priority: normalizePriority(s.req.priority),
      rank: rankByRequestId.get(s.req.id) ?? 0, total,
      interest: interestLevel(s.score), interestScore: s.score,
      interestOutOf5: interestOutOf5(s.score), matched: s.matched,
      confirmedCount: loadByUser.get(s.parties.userId) ?? 0,
      status: 'Approved',
    })
  }

  // Sidebar "Misc" — declined/withdrawn requests.
  const misc: MiscItem[] = rejected.map(s => ({
    requestId: s.req.id, userId: s.parties.userId, name: s.userName,
    company: s.company, image: s.image, status: 'Declined' as const,
  }))

  // Build day → slots with their meetings.
  const meetingsByBlock = new Map<string, SlotMeeting[]>()
  for (const m of sponsorMeetings) {
    const arr = meetingsByBlock.get(m.timeBlockId) ?? []
    arr.push({
      sponsorMeetingId: m.id, userId: m.userId,
      name: m.user?.name ?? 'Unknown', company: m.user?.company ?? null,
      image: m.user?.image ?? null, room: m.location,
    })
    meetingsByBlock.set(m.timeBlockId, arr)
  }
  const dayMap = new Map<string, MatrixDay>()
  for (const tb of timeBlocks) {
    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) {
      day = { dayKey: key, label: dayLabel(tb.startsAt), slots: [] }
      dayMap.set(key, day)
    }
    const meetings = meetingsByBlock.get(tb.id) ?? []
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      meetings,
      capacityLeft: Math.max(0, totalRoomCapacity - meetings.length),
    })
  }

  // Sidebar "Already Scheduled" — candidates with a confirmed meeting here.
  const alreadyScheduled: ScheduledItem[] = sponsorMeetings.map(m => ({
    sponsorMeetingId: m.id, userId: m.userId,
    name: m.user?.name ?? 'Unknown', company: m.user?.company ?? null,
    image: m.user?.image ?? null,
    confirmedCount: loadByUser.get(m.userId) ?? 0,
    timeBlockId: m.timeBlockId, room: m.location,
  }))

  return {
    sponsor: { id: sponsor.id, name: sponsor.name, logoUrl: sponsor.logoUrl, tier: sponsor.tier },
    rooms: MEETING_ROOMS,
    totalRoomCapacity,
    bank,
    pending,
    alreadyScheduled,
    misc,
    days: Array.from(dayMap.values()),
    confirmedCount: sponsorMeetings.length,
  }
}

// ── Availability (for the assign / reschedule sheets) ───────────────────────
export interface RoomAvailability {
  name: string
  capacity: number
  occupancy: number
  available: boolean
}
export interface AvailabilitySlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  candidateFree: boolean
  sponsorHasCapacity: boolean
  available: boolean // candidateFree && sponsorHasCapacity && some room free
  rooms: RoomAvailability[]
}
export interface AvailabilityDay {
  dayKey: string
  label: string
  slots: AvailabilitySlot[]
}
export interface CandidateAvailability {
  sponsorId: string
  userId: string
  days: AvailabilityDay[]
}

// Shared core: compute availability for a (sponsor, candidate) pair, optionally
// excluding one SponsorMeeting (used when rescheduling so the moved meeting does
// not conflict with itself).
async function computeAvailability(
  prisma: Db, sponsorId: string, userId: string, confId: string, excludeMeetingId?: string,
): Promise<AvailabilityDay[]> {
  const [timeBlocks, blackouts, candidateSponsorMtgs, candidateMeetings, sponsorMtgs] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId }, orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.blackoutTime.findMany({
      where: { userId }, select: { startsAt: true, endsAt: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { userId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true },
    }),
    prisma.meeting.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [{ attendeeAId: userId }, { attendeeBId: userId }],
      },
      select: { timeBlockId: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { sponsorId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true, location: true },
    }),
  ])

  const candidateBusyBlocks = new Set<string>([
    ...candidateSponsorMtgs.map(m => m.timeBlockId),
    ...candidateMeetings.map(m => m.timeBlockId),
  ])
  const sponsorCountByBlock = new Map<string, number>()
  const sponsorRoomByBlock = new Map<string, Map<string, number>>()
  for (const m of sponsorMtgs) {
    sponsorCountByBlock.set(m.timeBlockId, (sponsorCountByBlock.get(m.timeBlockId) ?? 0) + 1)
    if (m.location) {
      const roomMap = sponsorRoomByBlock.get(m.timeBlockId) ?? new Map<string, number>()
      roomMap.set(m.location, (roomMap.get(m.location) ?? 0) + 1)
      sponsorRoomByBlock.set(m.timeBlockId, roomMap)
    }
  }

  const dayMap = new Map<string, AvailabilityDay>()
  for (const tb of timeBlocks) {
    const hasBlackout = blackouts.some(b => overlaps(tb.startsAt, tb.endsAt, b.startsAt, b.endsAt))
    const candidateFree = !hasBlackout && !candidateBusyBlocks.has(tb.id)
    const sponsorCount = sponsorCountByBlock.get(tb.id) ?? 0
    const sponsorHasCapacity = sponsorCount < totalRoomCapacity
    const roomMap = sponsorRoomByBlock.get(tb.id) ?? new Map<string, number>()
    const rooms: RoomAvailability[] = MEETING_ROOMS.map(r => {
      const occupancy = roomMap.get(r.name) ?? 0
      return { name: r.name, capacity: r.capacity, occupancy, available: occupancy < r.capacity }
    })
    const available = candidateFree && sponsorHasCapacity && rooms.some(r => r.available)
    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) { day = { dayKey: key, label: dayLabel(tb.startsAt), slots: [] }; dayMap.set(key, day) }
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      candidateFree, sponsorHasCapacity, available, rooms,
    })
  }
  return Array.from(dayMap.values())
}

export async function getCandidateAvailability(
  prisma: Db, requestId: string, conferenceId?: string,
): Promise<CandidateAvailability> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const req = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    select: {
      requesterId: true, targetUserId: true, targetSponsorId: true,
      requester: { select: { sponsorId: true } },
    },
  })
  if (!req) throw new EngineError('REQUEST_NOT_FOUND')
  const parties = resolveParties(req as RequestLike)
  if (!parties) throw new EngineError('NOT_A_SPONSOR_REQUEST')
  const days = await computeAvailability(prisma, parties.sponsorId, parties.userId, confId)
  return { sponsorId: parties.sponsorId, userId: parties.userId, days }
}

// Availability for RESCHEDULING an existing meeting: excludes the meeting being
// moved so its current slot/room reads as free. Also returns the current slot.
export interface RescheduleAvailability extends CandidateAvailability {
  sponsorMeetingId: string
  current: { timeBlockId: string; room: string | null }
}
export async function getMeetingRescheduleAvailability(
  prisma: Db, sponsorMeetingId: string, conferenceId?: string,
): Promise<RescheduleAvailability> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, timeBlockId: true, location: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  const days = await computeAvailability(prisma, m.sponsorId, m.userId, confId, m.id)
  return {
    sponsorId: m.sponsorId, userId: m.userId, days,
    sponsorMeetingId: m.id, current: { timeBlockId: m.timeBlockId, room: m.location },
  }
}

// ── Guarded mutations ───────────────────────────────────────────────────────
async function assertSlotBookable(
  prisma: Db, sponsorId: string, userId: string, timeBlockId: string, room: string, excludeMeetingId?: string,
) {
  if (!roomByName(room)) throw new EngineError('UNKNOWN_ROOM', `Unknown room: ${room}`)
  const roomDef = roomByName(room)!

  const tb = await prisma.timeBlock.findUnique({
    where: { id: timeBlockId }, select: { startsAt: true, endsAt: true },
  })
  if (!tb) throw new EngineError('BAD_STATUS', 'Time block not found')

  // Candidate free? (blackout + own confirmed meetings anywhere)
  const [blackouts, candMtgs, candMeetings, sponsorMtgs] = await Promise.all([
    prisma.blackoutTime.findMany({ where: { userId }, select: { startsAt: true, endsAt: true } }),
    prisma.sponsorMeeting.findMany({
      where: { userId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true },
    }),
    prisma.meeting.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, OR: [{ attendeeAId: userId }, { attendeeBId: userId }] },
      select: { timeBlockId: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { sponsorId, timeBlockId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { location: true },
    }),
  ])
  const hasBlackout = blackouts.some(b => overlaps(tb.startsAt, tb.endsAt, b.startsAt, b.endsAt))
  const candidateBusy = hasBlackout ||
    candMtgs.some(m => m.timeBlockId === timeBlockId) ||
    candMeetings.some(m => m.timeBlockId === timeBlockId)
  if (candidateBusy) throw new EngineError('CANDIDATE_BUSY', 'Attendee is already booked or unavailable at that time')

  if (sponsorMtgs.length >= totalRoomCapacity) {
    throw new EngineError('SPONSOR_FULL', 'The company has no free tables in that time block')
  }
  const roomOccupancy = sponsorMtgs.filter(m => m.location === room).length
  if (roomOccupancy >= roomDef.capacity) {
    throw new EngineError('ROOM_CONFLICT', `${room} is already fully booked in that time block`)
  }
}

export interface AssignInput {
  requestId: string
  timeBlockId: string
  room: string
  repId?: string | null
}
export async function assignMeeting(prisma: Db, input: AssignInput) {
  const req = await prisma.meetingRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true, requesterId: true, targetUserId: true, targetSponsorId: true, status: true,
      requester: { select: { sponsorId: true } },
    },
  })
  if (!req) throw new EngineError('REQUEST_NOT_FOUND')
  if (!['PENDING', 'APPROVED'].includes(req.status)) {
    throw new EngineError('BAD_STATUS', `Cannot schedule a ${req.status} request`)
  }
  const parties = resolveParties(req as RequestLike)
  if (!parties) throw new EngineError('NOT_A_SPONSOR_REQUEST')

  const existing = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId: parties.sponsorId, userId: parties.userId, status: 'CONFIRMED' },
    select: { id: true },
  })
  if (existing) throw new EngineError('ALREADY_SCHEDULED', 'This pairing already has a confirmed meeting')

  await assertSlotBookable(prisma, parties.sponsorId, parties.userId, input.timeBlockId, input.room)

  const [meeting] = await prisma.$transaction([
    prisma.sponsorMeeting.create({
      data: {
        sponsorId: parties.sponsorId,
        userId: parties.userId,
        repId: input.repId ?? parties.repId,
        timeBlockId: input.timeBlockId,
        location: input.room,
        status: 'CONFIRMED',
      },
    }),
    prisma.meetingRequest.update({
      where: { id: req.id },
      data: { status: 'CONFIRMED', timeBlockId: input.timeBlockId },
    }),
  ])
  return meeting
}

// Find the CONFIRMED MeetingRequest that materialized into a given SponsorMeeting.
async function findLinkedRequest(prisma: Db, sponsorId: string, userId: string) {
  return prisma.meetingRequest.findFirst({
    where: {
      status: 'CONFIRMED',
      OR: [
        { targetSponsorId: sponsorId, requesterId: userId },
        { requester: { sponsorId }, targetUserId: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
}

export interface RescheduleInput {
  sponsorMeetingId: string
  timeBlockId: string
  room: string
}
export async function rescheduleMeeting(prisma: Db, input: RescheduleInput) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, status: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be rescheduled')

  await assertSlotBookable(prisma, m.sponsorId, m.userId, input.timeBlockId, input.room, m.id)

  const linked = await findLinkedRequest(prisma, m.sponsorId, m.userId)
  const writes: any[] = [
    prisma.sponsorMeeting.update({
      where: { id: m.id },
      data: { timeBlockId: input.timeBlockId, location: input.room },
    }),
  ]
  if (linked) {
    writes.push(prisma.meetingRequest.update({
      where: { id: linked.id }, data: { timeBlockId: input.timeBlockId },
    }))
  }
  const [meeting] = await prisma.$transaction(writes)
  return meeting
}

export interface CancelInput {
  sponsorMeetingId: string
  preserveRequest: boolean
  reason?: string | null
  notes?: string | null
}
export async function cancelMeeting(prisma: Db, input: CancelInput) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, status: true, notes: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  // Guard against a stale/duplicate cancel: without this, re-cancelling an
  // already-CANCELLED meeting would flip whatever confirmed request the pair
  // now has (e.g. a re-booked meeting) back to the bank, orphaning it.
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be cancelled')

  const linked = await findLinkedRequest(prisma, m.sponsorId, m.userId)
  const writes: any[] = [
    prisma.sponsorMeeting.update({
      where: { id: m.id },
      data: {
        status: 'CANCELLED',
        reason: input.reason ?? null,
        notes: input.notes ?? m.notes ?? null,
      },
    }),
  ]
  if (linked) {
    writes.push(prisma.meetingRequest.update({
      where: { id: linked.id },
      data: input.preserveRequest
        ? { status: 'APPROVED', timeBlockId: null }  // back to the bank
        : { status: 'CANCELLED' },                   // removed entirely
    }))
  }
  const [meeting] = await prisma.$transaction(writes)
  return { meeting, preserved: input.preserveRequest, requestUpdated: !!linked }
}

// ── Load-balancing hint ─────────────────────────────────────────────────────
// Given candidate loads, recommend scheduling the one with the fewest meetings
// (spreads attention across attendees). Returns the userId to prefer.
export function loadBalancePreferred(
  candidates: { userId: string; confirmedCount: number }[],
): string | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => (c.confirmedCount < best.confirmedCount ? c : best)).userId
}

// ── Priority auto-scheduler ───────────────────────────────────────────────────
// Greedily materializes MeetingRequests into confirmed SponsorMeetings, filling
// the highest-priority tier first (Best Fit → Med → Low), then best fit score,
// then oldest request. Honors every constraint assertSlotBookable enforces
// (candidate blackouts, one meeting per candidate per block, per-sponsor booth
// capacity, per-room capacity) via an in-memory occupancy simulation seeded from
// the existing confirmed state, so a whole conference is scheduled in one pass.
// dryRun returns the same plan without writing — used by the admin preview.
export interface AutoScheduleInput {
  conferenceId?: string
  sponsorId?: string    // limit to one company's booth; omit = every company
  statuses?: string[]   // eligible request statuses; default PENDING + APPROVED
  dryRun?: boolean      // simulate only, persist nothing
}
export interface AutoScheduledEntry {
  requestId: string
  sponsorId: string
  sponsorName: string
  userId: string
  userName: string
  priority: MeetingPriority
  score: number
  timeBlockId: string
  startsAt: string
  room: string
}
export interface AutoSkippedEntry {
  requestId: string
  sponsorId: string
  sponsorName: string
  userId: string
  userName: string
  priority: MeetingPriority
  reason: string
}
export interface TierSummary {
  tier: MeetingPriority
  eligible: number
  scheduled: number
  skipped: number
}
export interface AutoScheduleResult {
  dryRun: boolean
  scheduled: AutoScheduledEntry[]
  skipped: AutoSkippedEntry[]
  byTier: TierSummary[]
  totalEligible: number
}

export async function autoScheduleByPriority(
  prisma: Db, input: AutoScheduleInput = {},
): Promise<AutoScheduleResult> {
  const confId = await resolveConferenceId(prisma, input.conferenceId)
  const statuses = input.statuses ?? ['PENDING', 'APPROVED']
  const dryRun = !!input.dryRun

  const [timeBlocks, sponsors, confirmedMtgs, peerMeetings, blackouts, requests] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId }, orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sponsor.findMany({
      where: input.sponsorId ? { id: input.sponsorId } : { conferenceId: confId },
      select: { id: true, name: true, solutionsSeeking: true, solutionsOffering: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      select: { sponsorId: true, userId: true, timeBlockId: true, location: true },
    }),
    prisma.meeting.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { attendeeAId: true, attendeeBId: true, timeBlockId: true },
    }),
    prisma.blackoutTime.findMany({ select: { userId: true, startsAt: true, endsAt: true } }),
    prisma.meetingRequest.findMany({
      where: {
        status: { in: statuses },
        ...(input.sponsorId
          ? { OR: [{ targetSponsorId: input.sponsorId }, { requester: { sponsorId: input.sponsorId } }] }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true,
        status: true, priority: true, createdAt: true,
        requester: { select: { sponsorId: true, name: true, solutionsOffering: true, solutionsSeeking: true } },
        targetUser: { select: { name: true, solutionsOffering: true, solutionsSeeking: true } },
      },
    }),
  ])

  const sponsorById = new Map(sponsors.map(s => [s.id, s]))
  const sponsorIdSet = new Set(sponsors.map(s => s.id))

  // In-memory occupancy, seeded from the existing confirmed state.
  const sponsorBlockCount = new Map<string, Map<string, number>>()          // sponsor → block → count
  const sponsorBlockRoom = new Map<string, Map<string, Map<string, number>>>() // sponsor → block → room → count
  const candidateBusy = new Map<string, Set<string>>()                      // user → busy blocks
  const scheduledPairs = new Set<string>()                                  // `${sponsorId}::${userId}`

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const busyOf = (uid: string): Set<string> => {
    let s = candidateBusy.get(uid)
    if (!s) { s = new Set(); candidateBusy.set(uid, s) }
    return s
  }
  const sBlock = (sid: string): Map<string, number> => {
    let m = sponsorBlockCount.get(sid)
    if (!m) { m = new Map(); sponsorBlockCount.set(sid, m) }
    return m
  }
  const sRoom = (sid: string, tb: string): Map<string, number> => {
    let byBlock = sponsorBlockRoom.get(sid)
    if (!byBlock) { byBlock = new Map(); sponsorBlockRoom.set(sid, byBlock) }
    let m = byBlock.get(tb)
    if (!m) { m = new Map(); byBlock.set(tb, m) }
    return m
  }

  for (const m of confirmedMtgs) {
    bump(sBlock(m.sponsorId), m.timeBlockId)
    if (m.location) bump(sRoom(m.sponsorId, m.timeBlockId), m.location)
    busyOf(m.userId).add(m.timeBlockId)
    scheduledPairs.add(`${m.sponsorId}::${m.userId}`)
  }
  for (const pm of peerMeetings) {
    busyOf(pm.attendeeAId).add(pm.timeBlockId)
    busyOf(pm.attendeeBId).add(pm.timeBlockId)
  }

  // Per-candidate blackout-blocked time blocks (memoized).
  const blackoutByUser = new Map<string, { startsAt: Date; endsAt: Date }[]>()
  for (const b of blackouts) {
    const arr = blackoutByUser.get(b.userId) ?? []
    arr.push({ startsAt: b.startsAt, endsAt: b.endsAt })
    blackoutByUser.set(b.userId, arr)
  }
  const blockedCache = new Map<string, Set<string>>()
  const blockedOf = (uid: string): Set<string> => {
    let s = blockedCache.get(uid)
    if (!s) {
      s = new Set()
      const bl = blackoutByUser.get(uid)
      if (bl) for (const tb of timeBlocks) {
        if (bl.some(x => overlaps(tb.startsAt, tb.endsAt, x.startsAt, x.endsAt))) s.add(tb.id)
      }
      blockedCache.set(uid, s)
    }
    return s
  }

  // Build the eligible, scored, priority-ordered candidate list.
  interface Cand {
    reqId: string; sponsorId: string; sponsorName: string; userId: string; userName: string
    repId: string | null; priority: MeetingPriority; score: number; createdAt: Date
  }
  const cands: Cand[] = []
  for (const req of requests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || !sponsorIdSet.has(parties.sponsorId)) continue
    const sponsor = sponsorById.get(parties.sponsorId)!
    const cand = req.targetSponsorId ? req.requester : req.targetUser
    const { score } = scoreSolutionsMatch(
      parseSolutions(sponsor.solutionsSeeking), parseSolutions(sponsor.solutionsOffering),
      parseSolutions(cand?.solutionsOffering ?? null), parseSolutions(cand?.solutionsSeeking ?? null),
    )
    cands.push({
      reqId: req.id, sponsorId: parties.sponsorId, sponsorName: sponsor.name,
      userId: parties.userId, userName: cand?.name ?? 'Unknown', repId: parties.repId,
      priority: normalizePriority(req.priority), score, createdAt: req.createdAt,
    })
  }
  // Global order: Best Fit tier first (across all companies), then fit, then age.
  cands.sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    b.score - a.score ||
    a.createdAt.getTime() - b.createdAt.getTime())

  const toSkip = (c: Cand) => ({
    requestId: c.reqId, sponsorId: c.sponsorId, sponsorName: c.sponsorName,
    userId: c.userId, userName: c.userName, priority: c.priority,
  })

  const scheduled: AutoScheduledEntry[] = []
  const skipped: AutoSkippedEntry[] = []
  const writes: any[] = []
  const tbById = new Map(timeBlocks.map(tb => [tb.id, tb]))

  for (const c of cands) {
    const pairKey = `${c.sponsorId}::${c.userId}`
    if (scheduledPairs.has(pairKey)) {
      skipped.push({ ...toSkip(c), reason: 'Already has a meeting with this company' })
      continue
    }
    const busy = busyOf(c.userId)
    const blocked = blockedOf(c.userId)
    let placed: { timeBlockId: string; room: string } | null = null
    for (const tb of timeBlocks) {
      if (busy.has(tb.id) || blocked.has(tb.id)) continue
      if ((sBlock(c.sponsorId).get(tb.id) ?? 0) >= totalRoomCapacity) continue
      const roomCounts = sRoom(c.sponsorId, tb.id)
      const room = MEETING_ROOMS.find(r => (roomCounts.get(r.name) ?? 0) < r.capacity)
      if (!room) continue
      placed = { timeBlockId: tb.id, room: room.name }
      break
    }
    if (!placed) {
      skipped.push({ ...toSkip(c), reason: 'No free slot (candidate or company fully booked)' })
      continue
    }
    // Commit to in-memory state so later candidates see this occupancy.
    bump(sBlock(c.sponsorId), placed.timeBlockId)
    bump(sRoom(c.sponsorId, placed.timeBlockId), placed.room)
    busy.add(placed.timeBlockId)
    scheduledPairs.add(pairKey)
    const tb = tbById.get(placed.timeBlockId)!
    scheduled.push({
      requestId: c.reqId, sponsorId: c.sponsorId, sponsorName: c.sponsorName,
      userId: c.userId, userName: c.userName, priority: c.priority, score: c.score,
      timeBlockId: placed.timeBlockId, startsAt: tb.startsAt.toISOString(), room: placed.room,
    })
    if (!dryRun) {
      writes.push(prisma.sponsorMeeting.create({
        data: {
          sponsorId: c.sponsorId, userId: c.userId, repId: c.repId,
          timeBlockId: placed.timeBlockId, location: placed.room, status: 'CONFIRMED',
        },
      }))
      writes.push(prisma.meetingRequest.update({
        where: { id: c.reqId }, data: { status: 'CONFIRMED', timeBlockId: placed.timeBlockId },
      }))
    }
  }

  if (!dryRun && writes.length) await prisma.$transaction(writes)

  const byTier: TierSummary[] = MEETING_PRIORITIES.map(tier => ({
    tier,
    eligible: cands.filter(c => c.priority === tier).length,
    scheduled: scheduled.filter(s => s.priority === tier).length,
    skipped: skipped.filter(s => s.priority === tier).length,
  }))

  return { dryRun, scheduled, skipped, byTier, totalEligible: cands.length }
}
