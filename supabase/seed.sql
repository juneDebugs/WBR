-- Seed data for local development

-- Create a sample conference
insert into public.conferences (id, name, description, start_date, end_date, venue, active)
values (
  '00000000-0000-0000-0000-000000000001',
  'TechConf 2026',
  'The premier technology conference for developers and innovators.',
  '2026-06-15 09:00:00+00',
  '2026-06-17 18:00:00+00',
  'San Francisco Convention Center',
  true
);

-- Sample speakers (profile_id is null since we're seeding without auth users)
insert into public.speakers (id, conference_id, name, bio, company, job_title, twitter_handle)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Jane Smith', 'Jane is a renowned AI researcher with 15 years of experience.', 'DeepMind', 'Principal Researcher', '@janesmith'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Alex Johnson', 'Alex builds developer tools used by millions worldwide.', 'GitHub', 'Staff Engineer', '@alexj'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Maria Garcia', 'Maria specializes in distributed systems and cloud architecture.', 'AWS', 'Principal Architect', '@mariagarcia');

-- Sample sessions
insert into public.sessions (conference_id, title, description, speaker_id, room, starts_at, ends_at, track, type)
values
  ('00000000-0000-0000-0000-000000000001', 'Opening Keynote: The Future of AI', 'Exploring the next decade of artificial intelligence.', '10000000-0000-0000-0000-000000000001', 'Main Stage', '2026-06-15 09:00:00+00', '2026-06-15 10:00:00+00', 'Main Stage', 'keynote'),
  ('00000000-0000-0000-0000-000000000001', 'Building at Scale with GitHub Actions', 'Best practices for CI/CD pipelines at scale.', '10000000-0000-0000-0000-000000000002', 'Track A', '2026-06-15 10:30:00+00', '2026-06-15 11:30:00+00', 'DevOps', 'talk'),
  ('00000000-0000-0000-0000-000000000001', 'Distributed Systems Deep Dive', 'Understanding CAP theorem in practice.', '10000000-0000-0000-0000-000000000003', 'Track B', '2026-06-15 10:30:00+00', '2026-06-15 11:30:00+00', 'Architecture', 'talk'),
  ('00000000-0000-0000-0000-000000000001', 'Lunch Break', null, null, 'Expo Hall', '2026-06-15 12:00:00+00', '2026-06-15 13:00:00+00', null, 'break'),
  ('00000000-0000-0000-0000-000000000001', 'Workshop: Building with AI APIs', 'Hands-on workshop integrating LLMs into your apps.', '10000000-0000-0000-0000-000000000001', 'Workshop Room', '2026-06-15 13:00:00+00', '2026-06-15 15:00:00+00', 'AI/ML', 'workshop');

-- Sample sponsors
insert into public.sponsors (conference_id, name, tier, description, display_order)
values
  ('00000000-0000-0000-0000-000000000001', 'TechCorp Inc.', 'platinum', 'Leading enterprise software company.', 1),
  ('00000000-0000-0000-0000-000000000001', 'CloudBase', 'gold', 'Powering the cloud-native revolution.', 2),
  ('00000000-0000-0000-0000-000000000001', 'DevTools Pro', 'silver', 'Developer productivity tools.', 3),
  ('00000000-0000-0000-0000-000000000001', 'OpenSource Foundation', 'bronze', 'Supporting open source development.', 4);
