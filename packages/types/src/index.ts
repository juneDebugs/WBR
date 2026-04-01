// ─── Database Row Types ───────────────────────────────────────────────────────

export type UserRole = 'attendee' | 'organizer' | 'speaker'
export type SessionType = 'talk' | 'workshop' | 'break' | 'keynote' | 'panel'
export type SponsorTier = 'platinum' | 'gold' | 'silver' | 'bronze'
export type MeetingStatus = 'pending' | 'confirmed' | 'cancelled'
export type ChatRoomType = 'direct' | 'group' | 'channel'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  company: string | null
  job_title: string | null
  expo_push_token: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Conference {
  id: string
  name: string
  description: string | null
  start_date: string
  end_date: string
  venue: string | null
  logo_url: string | null
  active: boolean
  created_at: string
}

export interface Speaker {
  id: string
  conference_id: string
  profile_id: string | null
  name: string
  bio: string | null
  photo_url: string | null
  company: string | null
  job_title: string | null
  twitter_handle: string | null
  linkedin_url: string | null
  created_at: string
}

export interface Session {
  id: string
  conference_id: string
  title: string
  description: string | null
  speaker_id: string | null
  room: string | null
  starts_at: string
  ends_at: string
  track: string | null
  type: SessionType
  created_at: string
  // joined
  speaker?: Speaker
}

export interface Sponsor {
  id: string
  conference_id: string
  name: string
  logo_url: string | null
  website_url: string | null
  tier: SponsorTier
  description: string | null
  display_order: number
  created_at: string
}

export interface TimeBlock {
  id: string
  conference_id: string
  starts_at: string
  ends_at: string
  location: string | null
  capacity: number
  created_by: string
  created_at: string
}

export interface Meeting {
  id: string
  conference_id: string
  time_block_id: string
  organizer_id: string
  attendee_a_id: string
  attendee_b_id: string
  status: MeetingStatus
  notes: string | null
  created_at: string
  // joined
  time_block?: TimeBlock
  attendee_a?: Profile
  attendee_b?: Profile
}

export interface ChatRoom {
  id: string
  conference_id: string
  name: string | null
  type: ChatRoomType
  created_at: string
  // joined
  members?: Profile[]
  last_message?: Message
  unread_count?: number
}

export interface ChatRoomMember {
  room_id: string
  user_id: string
  joined_at: string
  last_read_at: string | null
}

export interface Message {
  id: string
  room_id: string
  sender_id: string
  content: string
  created_at: string
  updated_at: string | null
  // joined
  sender?: Profile
}

export interface Notification {
  id: string
  conference_id: string
  sent_by: string
  title: string
  body: string
  data: Record<string, unknown> | null
  recipient_filter: string
  sent_at: string
}

// ─── API / Form Types ─────────────────────────────────────────────────────────

export interface CreateSessionInput {
  conference_id: string
  title: string
  description?: string
  speaker_id?: string
  room?: string
  starts_at: string
  ends_at: string
  track?: string
  type: SessionType
}

export interface CreateSpeakerInput {
  conference_id: string
  name: string
  bio?: string
  photo_url?: string
  company?: string
  job_title?: string
  twitter_handle?: string
  linkedin_url?: string
}

export interface CreateSponsorInput {
  conference_id: string
  name: string
  logo_url?: string
  website_url?: string
  tier: SponsorTier
  description?: string
  display_order?: number
}

export interface CreateTimeBlockInput {
  conference_id: string
  starts_at: string
  ends_at: string
  location?: string
  capacity?: number
}

export interface CreateMeetingInput {
  conference_id: string
  time_block_id: string
  attendee_a_id: string
  attendee_b_id: string
  notes?: string
}

export interface SendNotificationInput {
  conference_id: string
  title: string
  body: string
  data?: Record<string, unknown>
  recipient_filter: 'all' | 'speakers' | 'organizers'
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

export interface DaySchedule {
  date: string // 'YYYY-MM-DD'
  sessions: Session[]
}
