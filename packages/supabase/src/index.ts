export { createClient } from '@supabase/supabase-js'

// ─── Shared query helpers ─────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Session, Speaker, Sponsor, Meeting, ChatRoom, Message, Profile, DaySchedule } from '@conference/types'

/** Group sessions by calendar day (YYYY-MM-DD) */
export function groupSessionsByDay(sessions: Session[]): DaySchedule[] {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const day = s.starts_at.slice(0, 10)
    const list = map.get(day) ?? []
    list.push(s)
    map.set(day, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({ date, sessions: sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }))
}

/** Fetch the currently active conference */
export async function getActiveConference(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('conferences')
    .select('*')
    .eq('active', true)
    .single()
  if (error) throw error
  return data
}

/** Fetch sessions with speaker info for a conference */
export async function getSessions(supabase: SupabaseClient, conferenceId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*, speaker:speakers(*)')
    .eq('conference_id', conferenceId)
    .order('starts_at')
  if (error) throw error
  return data ?? []
}

/** Fetch all speakers for a conference */
export async function getSpeakers(supabase: SupabaseClient, conferenceId: string): Promise<Speaker[]> {
  const { data, error } = await supabase
    .from('speakers')
    .select('*')
    .eq('conference_id', conferenceId)
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Fetch all sponsors for a conference, ordered by tier then display_order */
export async function getSponsors(supabase: SupabaseClient, conferenceId: string): Promise<Sponsor[]> {
  const { data, error } = await supabase
    .from('sponsors')
    .select('*')
    .eq('conference_id', conferenceId)
    .order('display_order')
  if (error) throw error
  return data ?? []
}

/** Fetch meetings for a given attendee (either side) */
export async function getMyMeetings(supabase: SupabaseClient, userId: string, conferenceId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*, time_block:time_blocks(*), attendee_a:profiles!meetings_attendee_a_id_fkey(*), attendee_b:profiles!meetings_attendee_b_id_fkey(*)')
    .eq('conference_id', conferenceId)
    .or(`attendee_a_id.eq.${userId},attendee_b_id.eq.${userId}`)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

/** Fetch chat rooms for a user */
export async function getMyChatRooms(supabase: SupabaseClient, userId: string, conferenceId: string): Promise<ChatRoom[]> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('*, members:chat_room_members!inner(user_id, profiles(*))')
    .eq('conference_id', conferenceId)
    .eq('chat_room_members.user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Fetch messages in a room */
export async function getMessages(supabase: SupabaseClient, roomId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles(*)')
    .eq('room_id', roomId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

/** Upsert expo push token on the user's profile */
export async function savePushToken(supabase: SupabaseClient, userId: string, token: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)
  if (error) throw error
}

export * from '@conference/types'
