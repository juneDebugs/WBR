import 'server-only'
import { prisma } from '@conference/db'
import {
  getAllChatMessagingSettings,
  saveChatMessagingSettings,
  DEFAULT_VENDOR_SETTINGS,
  DEFAULT_STAFF_SETTINGS,
  type VendorSettings,
  type StaffSettings,
} from '@conference/db'
import { staffRosterWhere, STAFF_ROSTER_ORDER_BY } from '@conference/db/src/staff-roster'

// Server-only view model for the admin Chat → Settings tab. Joins the vendor
// (Sponsor company) roster and the WBR Staff roster with the stored
// ChatMessagingPermission rows, filling permissive defaults for anyone without
// an explicit row yet.

export type VendorSettingRow = {
  sponsorId: string
  name: string
  tier: string
  logoUrl: string | null
} & VendorSettings

export type StaffSettingRow = {
  userId: string
  name: string
  email: string
} & StaffSettings

export type ChatSettingsView = {
  vendorGlobal: { enabled: boolean }
  vendors: VendorSettingRow[]
  staff: StaffSettingRow[]
}

export async function getChatSettingsView(): Promise<ChatSettingsView> {
  const [settings, sponsors, staff] = await Promise.all([
    getAllChatMessagingSettings(prisma),
    prisma.sponsor.findMany({
      select: { id: true, name: true, tier: true, logoUrl: true },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.user.findMany({
      where: staffRosterWhere(),
      select: { id: true, name: true, email: true },
      orderBy: STAFF_ROSTER_ORDER_BY,
    }),
  ])

  return {
    vendorGlobal: { enabled: settings.vendorGlobal.enabled },
    vendors: sponsors.map(s => {
      const v = settings.vendors[s.id] ?? DEFAULT_VENDOR_SETTINGS
      return {
        sponsorId: s.id,
        name: s.name,
        tier: s.tier,
        logoUrl: s.logoUrl ?? null,
        toAttendees: v.toAttendees,
        toSpeakers: v.toSpeakers,
      }
    }),
    staff: staff.map(u => {
      const st = settings.staff[u.id] ?? DEFAULT_STAFF_SETTINGS
      return {
        userId: u.id,
        name: u.name ?? '—',
        email: u.email ?? '',
        toAttendees: st.toAttendees,
        toVendors: st.toVendors,
        toSpeakers: st.toSpeakers,
      }
    }),
  }
}

export async function saveChatSettingsView(payload: {
  vendorGlobal?: { enabled: boolean } | null
  vendors?: { sponsorId: string; settings: Partial<VendorSettings> }[]
  staff?: { userId: string; settings: Partial<StaffSettings> }[]
}): Promise<ChatSettingsView> {
  await saveChatMessagingSettings(prisma, payload)
  return getChatSettingsView()
}
