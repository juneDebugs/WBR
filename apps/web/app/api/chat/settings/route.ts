import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChatSettingsView, saveChatSettingsView } from '@/lib/chat-settings-server'

// Chat messaging permissions live behind the Chat page, which is already gated
// by the `chat` dashboard permission. Reading and writing these controls is a
// staff/organizer action, matching the other Chat mutations (broadcast, sync,
// clear-all).
const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

function sessionRole(session: unknown): string {
  return (session as { user?: { role?: string } } | null)?.user?.role ?? ''
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const view = await getChatSettingsView()
  return NextResponse.json(view)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    vendorGlobal?: { enabled?: unknown } | null
    vendors?: unknown
    staff?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Coerce defensively — normalizers in the data layer force strict booleans, so
  // here we only need to validate the array/id shapes.
  const vendors = Array.isArray(body.vendors)
    ? body.vendors
        .filter((v: any) => v && typeof v.sponsorId === 'string' && v.sponsorId)
        .map((v: any) => ({
          sponsorId: v.sponsorId as string,
          settings: { toAttendees: !!v.toAttendees, toSpeakers: !!v.toSpeakers },
        }))
    : []

  const staff = Array.isArray(body.staff)
    ? body.staff
        .filter((s: any) => s && typeof s.userId === 'string' && s.userId)
        .map((s: any) => ({
          userId: s.userId as string,
          settings: { toAttendees: !!s.toAttendees, toVendors: !!s.toVendors, toSpeakers: !!s.toSpeakers },
        }))
    : []

  const vendorGlobal =
    body.vendorGlobal && typeof body.vendorGlobal === 'object'
      ? { enabled: !!body.vendorGlobal.enabled }
      : undefined

  const view = await saveChatSettingsView({ vendorGlobal, vendors, staff })

  // The attendee-side enforcement reads these rows live, but the admin Chat page
  // caches under the `chat` tag — refresh it so a re-open reflects the save.
  revalidateTag('chat')

  return NextResponse.json({ ok: true, ...view })
}
