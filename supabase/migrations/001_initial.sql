-- ─── Enable extensions ──────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  bio text,
  company text,
  job_title text,
  expo_push_token text,
  role text not null default 'attendee' check (role in ('attendee', 'organizer', 'speaker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Conferences ─────────────────────────────────────────────────────────────
create table public.conferences (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  start_date timestamptz not null,
  end_date timestamptz not null,
  venue text,
  logo_url text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Speakers ────────────────────────────────────────────────────────────────
create table public.speakers (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  profile_id uuid references public.profiles on delete set null,
  name text not null,
  bio text,
  photo_url text,
  company text,
  job_title text,
  twitter_handle text,
  linkedin_url text,
  created_at timestamptz not null default now()
);

-- ─── Sessions ────────────────────────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  title text not null,
  description text,
  speaker_id uuid references public.speakers on delete set null,
  room text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  track text,
  type text not null default 'talk' check (type in ('talk', 'workshop', 'break', 'keynote', 'panel')),
  created_at timestamptz not null default now()
);

-- ─── Sponsors ────────────────────────────────────────────────────────────────
create table public.sponsors (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  tier text not null default 'bronze' check (tier in ('platinum', 'gold', 'silver', 'bronze')),
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ─── Time Blocks ─────────────────────────────────────────────────────────────
create table public.time_blocks (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  capacity integer not null default 1,
  created_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

-- ─── Meetings ────────────────────────────────────────────────────────────────
create table public.meetings (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  time_block_id uuid not null references public.time_blocks on delete cascade,
  organizer_id uuid not null references public.profiles on delete cascade,
  attendee_a_id uuid not null references public.profiles on delete cascade,
  attendee_b_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- ─── Chat Rooms ───────────────────────────────────────────────────────────────
create table public.chat_rooms (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  name text,
  type text not null default 'direct' check (type in ('direct', 'group', 'channel')),
  created_at timestamptz not null default now()
);

create table public.chat_room_members (
  room_id uuid not null references public.chat_rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (room_id, user_id)
);

-- ─── Messages ────────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.chat_rooms on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ─── Notifications ────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  conference_id uuid not null references public.conferences on delete cascade,
  sent_by uuid not null references public.profiles on delete cascade,
  title text not null,
  body text not null,
  data jsonb,
  recipient_filter text not null default 'all',
  sent_at timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index sessions_conference_starts on public.sessions (conference_id, starts_at);
create index meetings_attendee_a on public.meetings (attendee_a_id);
create index meetings_attendee_b on public.meetings (attendee_b_id);
create index messages_room_created on public.messages (room_id, created_at);
create index chat_room_members_user on public.chat_room_members (user_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.conferences enable row level security;
alter table public.speakers enable row level security;
alter table public.sessions enable row level security;
alter table public.sponsors enable row level security;
alter table public.time_blocks enable row level security;
alter table public.meetings enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Helper: is current user an organizer?
create or replace function public.is_organizer()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'organizer'
  );
$$;

-- Profiles: users can read all profiles, update only their own
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Conferences: anyone authenticated can read, organizers can write
create policy "conferences_read" on public.conferences for select using (auth.role() = 'authenticated');
create policy "conferences_write" on public.conferences for all using (public.is_organizer());

-- Speakers: authenticated can read, organizers can write
create policy "speakers_read" on public.speakers for select using (auth.role() = 'authenticated');
create policy "speakers_write" on public.speakers for all using (public.is_organizer());

-- Sessions: authenticated can read, organizers can write
create policy "sessions_read" on public.sessions for select using (auth.role() = 'authenticated');
create policy "sessions_write" on public.sessions for all using (public.is_organizer());

-- Sponsors: authenticated can read, organizers can write
create policy "sponsors_read" on public.sponsors for select using (auth.role() = 'authenticated');
create policy "sponsors_write" on public.sponsors for all using (public.is_organizer());

-- Time blocks: authenticated can read, organizers can write
create policy "time_blocks_read" on public.time_blocks for select using (auth.role() = 'authenticated');
create policy "time_blocks_write" on public.time_blocks for all using (public.is_organizer());

-- Meetings: attendees can read their own, organizers can read/write all
create policy "meetings_read_own" on public.meetings for select
  using (auth.uid() in (attendee_a_id, attendee_b_id) or public.is_organizer());
create policy "meetings_write_organizer" on public.meetings for all using (public.is_organizer());

-- Chat rooms: members can read
create policy "chat_rooms_read" on public.chat_rooms for select
  using (
    exists (
      select 1 from public.chat_room_members
      where room_id = id and user_id = auth.uid()
    ) or public.is_organizer()
  );
create policy "chat_rooms_insert" on public.chat_rooms for insert
  with check (auth.role() = 'authenticated');

-- Chat room members: members of the room can read membership
create policy "chat_room_members_read" on public.chat_room_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.chat_room_members m
      where m.room_id = room_id and m.user_id = auth.uid()
    )
  );
create policy "chat_room_members_insert" on public.chat_room_members for insert
  with check (auth.role() = 'authenticated');
create policy "chat_room_members_update_own" on public.chat_room_members for update
  using (user_id = auth.uid());

-- Messages: room members can read and send
create policy "messages_read" on public.messages for select
  using (
    exists (
      select 1 from public.chat_room_members
      where room_id = messages.room_id and user_id = auth.uid()
    )
  );
create policy "messages_insert" on public.messages for insert
  with check (
    sender_id = auth.uid() and
    exists (
      select 1 from public.chat_room_members
      where room_id = messages.room_id and user_id = auth.uid()
    )
  );
create policy "messages_update_own" on public.messages for update
  using (sender_id = auth.uid());

-- Notifications: authenticated can read, organizers can write
create policy "notifications_read" on public.notifications for select using (auth.role() = 'authenticated');
create policy "notifications_write" on public.notifications for insert using (public.is_organizer());

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Enable realtime on messages and meetings
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.meetings;
