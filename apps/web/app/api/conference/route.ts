import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, name, venue, venueLat, venueLon, venueTimezone, startDate, endDate, heroImageUrl, wifiName, wifiPassword, loginTitle, loginSubtitle, loginButtonText } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const data: Record<string, any> = {}
  if (name !== undefined) data.name = name
  if (venue !== undefined) data.venue = venue
  if (venueLat !== undefined) data.venueLat = venueLat ? parseFloat(venueLat) : null
  if (venueLon !== undefined) data.venueLon = venueLon ? parseFloat(venueLon) : null
  if (venueTimezone !== undefined) data.venueTimezone = venueTimezone || null
  if (heroImageUrl !== undefined) data.heroImageUrl = heroImageUrl
  if (wifiName !== undefined) data.wifiName = wifiName
  if (wifiPassword !== undefined) data.wifiPassword = wifiPassword
  if (loginTitle !== undefined) data.loginTitle = loginTitle || null
  if (loginSubtitle !== undefined) data.loginSubtitle = loginSubtitle || null
  if (loginButtonText !== undefined) data.loginButtonText = loginButtonText || null
  if (startDate !== undefined) data.startDate = new Date(startDate)
  if (endDate !== undefined) data.endDate = new Date(endDate)

  const conf = await prisma.conference.update({ where: { id }, data })
  revalidateTag('app-settings')
  return NextResponse.json({ ok: true, conference: conf })
}
