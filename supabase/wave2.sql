-- =====================================================================
-- Wave 2: community (migration: wave2_community)
-- Team seasons, monthly quests, the 300/400/500 kg club, Ki blast kudos,
-- "best time to come", the gym TV board and opt-in push notifications.
-- Points reward showing up, never kilos or bodyweight (see RESEARCH.md).
-- All dates use Europe/Zagreb.
-- =====================================================================

-- ---------- one opt-in for names on boards and the gym TV ----------
alter table public.profiles add column if not exists show_on_boards boolean not null default false;

-- A member's training days: days with a desk check-in or a logged workout.
create or replace function public.training_days(p_from date, p_to date)
returns table (user_id uuid, d date)
language sql stable security definer set search_path = public as $$
  select w.user_id, w.performed_on from public.workouts w where w.performed_on between p_from and p_to
  union
  select c.user_id, (c.checked_in_at at time zone 'Europe/Zagreb')::date from public.check_ins c
   where (c.checked_in_at at time zone 'Europe/Zagreb')::date between p_from and p_to;
$$;
revoke execute on function public.training_days(date, date) from public, anon, authenticated;

create or replace function public.zagreb_today() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Europe/Zagreb')::date $$;

-- ---------- team seasons (6–8 weeks, small squads, consistency points) ----------
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on + 34 and ends_on <= starts_on + 62)   -- 5 to 9 weeks
);
create table if not exists public.season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null check (length(name) between 1 and 30),
  color int not null default 0 check (color between 0 and 3)
);
create index if not exists season_teams_season_idx on public.season_teams(season_id);
create table if not exists public.season_members (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.season_teams(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index if not exists season_members_user_idx on public.season_members(user_id);
create index if not exists season_members_team_idx on public.season_members(team_id);
alter table public.seasons enable row level security;
alter table public.season_teams enable row level security;
alter table public.season_members enable row level security;
create policy "seasons read"       on public.seasons for select using ((select auth.uid()) is not null);
create policy "seasons admin"      on public.seasons for all using (public.is_admin()) with check (public.is_admin());
create policy "teams read"         on public.season_teams for select using ((select auth.uid()) is not null);
create policy "teams admin"        on public.season_teams for all using (public.is_admin()) with check (public.is_admin());
create policy "season own read"    on public.season_members for select using (user_id = (select auth.uid()) or public.is_staff());
create policy "season own leave"   on public.season_members for delete using (user_id = (select auth.uid()) or public.is_admin());
-- joining goes through join_season(), which picks the team

-- The season to show: on now, starting within 14 days, or ended in the last 14 days
-- (final table). The newest one wins.
create or replace function public.current_season_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.seasons s
   where s.starts_on - 14 <= public.zagreb_today() and s.ends_on >= public.zagreb_today() - 14
   order by s.starts_on desc limit 1;
$$;
revoke execute on function public.current_season_id() from public, anon;
grant execute on function public.current_season_id() to authenticated;

-- 10 points per training day (max 4 a week) + 10 for a week with 2 or more.
create or replace function public.season_points(p_season uuid)
returns table (user_id uuid, team_id uuid, points int)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.seasons where id = p_season),
  m as (select sm.user_id, sm.team_id from public.season_members sm where sm.season_id = p_season),
  days as (
    select td.user_id, td.d from s, public.training_days(s.starts_on, least(s.ends_on, public.zagreb_today())) td
     where td.user_id in (select m.user_id from m)
  ),
  wk as (select days.user_id, date_trunc('week', days.d) w, count(*) n from days group by 1, 2)
  select m.user_id, m.team_id,
         coalesce(sum(least(wk.n, 4) * 10 + case when wk.n >= 2 then 10 else 0 end), 0)::int
    from m left join wk on wk.user_id = m.user_id group by m.user_id, m.team_id;
$$;
revoke execute on function public.season_points(uuid) from public, anon, authenticated;

-- Standings: team totals and the per-member average (fair for uneven team sizes).
create or replace function public.season_standings()
returns table (season_id uuid, season_name text, starts_on date, ends_on date, team_id uuid, team_name text,
               color int, members int, points int, avg_points int)
language plpgsql stable security definer set search_path = public as $$
declare v_s uuid := public.current_season_id();
begin
  if auth.uid() is null or v_s is null then return; end if;
  return query
  select s.id, s.name, s.starts_on, s.ends_on, t.id, t.name, t.color,
         count(p.user_id)::int, coalesce(sum(p.points), 0)::int,
         case when count(p.user_id) = 0 then 0 else round(sum(p.points)::numeric / count(p.user_id))::int end
    from public.seasons s join public.season_teams t on t.season_id = s.id
    left join public.season_points(v_s) p on p.team_id = t.id
   where s.id = v_s
   group by s.id, s.name, s.starts_on, s.ends_on, t.id, t.name, t.color
   order by 10 desc, 9 desc, t.name;
end $$;
revoke execute on function public.season_standings() from public, anon;
grant execute on function public.season_standings() to authenticated;

-- My team: first names and points of teammates (joining shows them to the team).
create or replace function public.my_season()
returns table (team_id uuid, team_name text, color int, first_name text, points int, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_s uuid := public.current_season_id(); v_team uuid;
begin
  if auth.uid() is null or v_s is null then return; end if;
  select sm.team_id into v_team from public.season_members sm where sm.season_id = v_s and sm.user_id = auth.uid();
  if v_team is null then return; end if;
  return query
  select t.id, t.name, t.color, coalesce(nullif(split_part(pr.display_name, ' ', 1), ''), '—'), p.points, p.user_id = auth.uid()
    from public.season_points(v_s) p join public.season_teams t on t.id = p.team_id
    join public.profiles pr on pr.id = p.user_id
   where p.team_id = v_team order by p.points desc, 4;
end $$;
revoke execute on function public.my_season() from public, anon;
grant execute on function public.my_season() to authenticated;

-- Join the season on now: the team with the fewest members (ties: fewest points).
create or replace function public.join_season() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_s uuid; v_team uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select s.id into v_s from public.seasons s
   where s.starts_on - 14 <= public.zagreb_today() and s.ends_on >= public.zagreb_today()
   order by s.starts_on limit 1;
  if v_s is null then raise exception 'no season'; end if;
  perform pg_advisory_xact_lock(hashtext('season_join:' || v_s));
  select sm.team_id into v_team from public.season_members sm where sm.season_id = v_s and sm.user_id = auth.uid();
  if v_team is not null then return v_team; end if;
  select t.id into v_team from public.season_teams t
    left join public.season_members sm on sm.team_id = t.id
    left join public.season_points(v_s) p on p.user_id = sm.user_id
   where t.season_id = v_s group by t.id
   order by count(sm.user_id), coalesce(sum(p.points), 0), random() limit 1;
  if v_team is null then raise exception 'no teams'; end if;
  insert into public.season_members(season_id, user_id, team_id) values (v_s, auth.uid(), v_team);
  return v_team;
end $$;
revoke execute on function public.join_season() from public, anon;
grant execute on function public.join_season() to authenticated;

-- A season that members can join: on now, or starting within 14 days.
create or replace function public.open_season()
returns table (id uuid, name text, starts_on date, ends_on date, teams int, joined boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.starts_on, s.ends_on,
         (select count(*)::int from public.season_teams t where t.season_id = s.id),
         exists (select 1 from public.season_members sm where sm.season_id = s.id and sm.user_id = auth.uid())
    from public.seasons s
   where auth.uid() is not null and s.starts_on - 14 <= public.zagreb_today() and s.ends_on >= public.zagreb_today()
   order by s.starts_on limit 1;
$$;
revoke execute on function public.open_season() from public, anon;
grant execute on function public.open_season() to authenticated;

-- Admin: create a season with its teams in one call.
create or replace function public.create_season(p_name text, p_starts date, p_weeks int, p_teams text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; i int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_weeks not between 6 and 8 then raise exception 'weeks'; end if;
  if coalesce(array_length(p_teams, 1), 0) not between 2 and 4 then raise exception 'teams'; end if;
  if exists (select 1 from public.seasons s where s.ends_on >= p_starts and s.starts_on <= p_starts + p_weeks * 7 - 1) then
    raise exception 'overlap';
  end if;
  insert into public.seasons(name, starts_on, ends_on) values (trim(p_name), p_starts, p_starts + p_weeks * 7 - 1) returning id into v_id;
  for i in 1..array_length(p_teams, 1) loop
    insert into public.season_teams(season_id, name, color) values (v_id, trim(p_teams[i]), i - 1);
  end loop;
  return v_id;
end $$;
revoke execute on function public.create_season(text, date, int, text[]) from public, anon;
grant execute on function public.create_season(text, date, int, text[]) to authenticated;

-- ---------- monthly quests (set by Zrinko) ----------
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('days', 'checkins', 'strong_weeks', 'sets')),
  target int not null check (target between 1 and 300),
  exercise_id uuid references public.exercises(id) on delete set null,
  title_hr text not null check (length(title_hr) between 1 and 80),
  title_en text not null check (length(title_en) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists quests_month_idx on public.quests(month);
create index if not exists quests_exercise_idx on public.quests(exercise_id);
create index if not exists quests_created_by_idx on public.quests(created_by);
alter table public.quests enable row level security;
create policy "quests read"  on public.quests for select using ((select auth.uid()) is not null);
create policy "quests admin" on public.quests for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.my_quests()
returns table (id uuid, kind text, target int, title_hr text, title_en text, progress int, done boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m date := date_trunc('month', public.zagreb_today())::date;
  v_end date := (date_trunc('month', public.zagreb_today()) + interval '1 month - 1 day')::date;
begin
  if v_uid is null then return; end if;
  return query
  with days as (select td.d from public.training_days(v_m, v_end) td where td.user_id = v_uid),
  q as (
    select qq.*, case qq.kind
      when 'days' then (select count(*) from days)
      when 'checkins' then (select count(*) from public.check_ins c where c.user_id = v_uid
                             and (c.checked_in_at at time zone 'Europe/Zagreb')::date between v_m and v_end)
      when 'strong_weeks' then (select count(*) from (select date_trunc('week', days.d) from days group by 1 having count(*) >= 2) z)
      when 'sets' then (select count(*) from public.workouts w join public.workout_sets s on s.workout_id = w.id
                         where w.user_id = v_uid and w.performed_on between v_m and v_end
                           and (qq.exercise_id is null or s.exercise_id = qq.exercise_id))
    end::int prog
    from public.quests qq where qq.month = v_m
  )
  select q.id, q.kind, q.target, q.title_hr, q.title_en, least(q.prog, q.target), q.prog >= q.target from q order by q.created_at;
end $$;
revoke execute on function public.my_quests() from public, anon;
grant execute on function public.my_quests() to authenticated;

-- ---------- 300 / 400 / 500 kg club (coach-verified) ----------
create table if not exists public.club_lifts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  squat_kg numeric(5,1) not null check (squat_kg between 0 and 500),
  bench_kg numeric(5,1) not null check (bench_kg between 0 and 400),
  deadlift_kg numeric(5,1) not null check (deadlift_kg between 0 and 500),
  total_kg numeric(6,1) generated always as (squat_kg + bench_kg + deadlift_kg) stored,
  verified_by uuid references auth.users(id) on delete set null default auth.uid(),
  verified_at timestamptz not null default now()
);
create index if not exists club_lifts_verified_by_idx on public.club_lifts(verified_by);
alter table public.club_lifts enable row level security;
create policy "club own read"     on public.club_lifts for select using (user_id = (select auth.uid()) or public.is_staff());
create policy "club staff add"    on public.club_lifts for insert with check (public.is_staff());
create policy "club staff edit"   on public.club_lifts for update using (public.is_staff()) with check (public.is_staff());
create policy "club own remove"   on public.club_lifts for delete using (user_id = (select auth.uid()) or public.is_admin());
create or replace function public.guard_club_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  new.verified_by := auth.uid();
  new.verified_at := now();
  return new;
end $$;
revoke all on function public.guard_club_write() from public, anon, authenticated;
drop trigger if exists club_lifts_guard on public.club_lifts;
create trigger club_lifts_guard before insert or update on public.club_lifts
  for each row execute function public.guard_club_write();

-- The board: tier for everyone in the club; first name and total only for members who opted in.
create or replace function public.club_board()
returns table (tier int, first_name text, total_kg numeric, verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select (case when c.total_kg >= 500 then 500 when c.total_kg >= 400 then 400 else 300 end),
         case when p.show_on_boards then nullif(split_part(p.display_name, ' ', 1), '') end,
         case when p.show_on_boards then c.total_kg end,
         c.verified_at
    from public.club_lifts c join public.profiles p on p.id = c.user_id
   where auth.uid() is not null and c.total_kg >= 300
   order by c.total_kg desc;
$$;
revoke execute on function public.club_board() from public, anon;
grant execute on function public.club_board() to authenticated;

-- ---------- Ki blast: one-tap kudos on PR bells, no comments ----------
create table if not exists public.pr_kudos (
  bell_id bigint not null references public.pr_bells(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (bell_id, user_id)
);
create index if not exists pr_kudos_user_idx on public.pr_kudos(user_id);
alter table public.pr_kudos enable row level security;
-- the bell subquery runs under the caller's RLS, so kudos follow the bell's 14-day window
create policy "kudos read"   on public.pr_kudos for select
  using ((select auth.uid()) is not null and exists (select 1 from public.pr_bells b where b.id = bell_id));
create policy "kudos give"   on public.pr_kudos for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.pr_bells b where b.id = bell_id));
create policy "kudos take back" on public.pr_kudos for delete using (user_id = (select auth.uid()));

-- ---------- best time to come ----------
-- Presence per weekday and hour over the last 8 weeks (a visit counts for each hour it
-- covers, 90 minutes when nobody checked out). Thin slots (under 5 visits) are hidden, and nothing is
-- returned until there are 30 visits in total, so no slot can point at one person.
create or replace function public.best_times()
returns table (dow int, hour int, level int)
language plpgsql stable security definer set search_path = public as $$
declare v_total int;
begin
  select count(*) into v_total from public.check_ins c where c.checked_in_at > now() - interval '8 weeks';
  if v_total < 30 then return; end if;
  return query
  with pres as (
    select extract(isodow from h)::int dw, extract(hour from h)::int hr, count(*) n
      from public.check_ins c,
           generate_series(date_trunc('hour', c.checked_in_at at time zone 'Europe/Zagreb'),
                           (least(coalesce(c.checked_out_at, c.checked_in_at + interval '90 minutes'), c.checked_in_at + interval '3 hours')
                              at time zone 'Europe/Zagreb') - interval '1 minute', interval '1 hour') h
     where c.checked_in_at > now() - interval '8 weeks'
     group by 1, 2
  ), open_slots as (
    select pres.* from pres where pres.hr >= 6 and pres.hr < case when pres.dw = 7 then 20 else 22 end and pres.n >= 5
  )
  -- 0 quiet, 1 medium, 2 busy, as a share of the busiest hour
  select o.dw, o.hr, least(2, floor(3.0 * o.n / max(o.n) over ()))::int from open_slots o order by 1, 2;
end $$;
revoke execute on function public.best_times() from public;
grant execute on function public.best_times() to anon, authenticated;

-- ---------- gym TV board (staff screen) ----------
create or replace function public.tv_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.zagreb_today(); v_m date := date_trunc('month', public.zagreb_today())::date;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return jsonb_build_object(
    'occupancy', public.current_occupancy(),
    'standings', coalesce((select jsonb_agg(to_jsonb(s)) from public.season_standings() s), '[]'),
    'bells', coalesce((select jsonb_agg(jsonb_build_object('first_name', b.first_name, 'load_kg', b.load_kg, 'reps', b.reps,
                 'name_hr', e.name_hr, 'name_en', e.name_en, 'created_at', b.created_at,
                 'kudos', (select count(*) from public.pr_kudos k where k.bell_id = b.id)) order by b.created_at desc)
               from (select * from public.pr_bells where created_at > now() - interval '14 days' order by created_at desc limit 8) b
               join public.exercises e on e.id = b.exercise_id), '[]'),
    'club', coalesce((select jsonb_agg(to_jsonb(c)) from public.club_board() c), '[]'),
    'quests', coalesce((select jsonb_agg(jsonb_build_object('title_hr', q.title_hr, 'title_en', q.title_en, 'target', q.target, 'kind', q.kind) order by q.created_at)
               from public.quests q where q.month = v_m), '[]'),
    'post', (select jsonb_build_object('title', p.title, 'image', p.images[1], 'published_at', p.published_at)
               from public.posts p where p.status = 'published' and 'members' = any(p.channels)
               order by p.published_at desc nulls last limit 1),
    'best', coalesce((select jsonb_agg(jsonb_build_object('hour', b.hour, 'level', b.level) order by b.hour)
               from public.best_times() b where b.dow = extract(isodow from v_today)::int), '[]')
  );
end $$;
revoke execute on function public.tv_board() from public, anon;
grant execute on function public.tv_board() to authenticated;

-- ---------- push notifications (opt-in, at most one a day) ----------
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique check (length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 80 and 120),
  auth text not null check (length(auth) between 16 and 40),
  topics text[] not null default '{news,quiet}' check (topics <@ array['news', 'quiet']),
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "push own read"   on public.push_subscriptions for select using (user_id = (select auth.uid()));
create policy "push own delete" on public.push_subscriptions for delete using (user_id = (select auth.uid()));

-- Only real browser push services, so the sender can never be pointed at another host.
create or replace function public.push_endpoint_ok(p_endpoint text) returns boolean
language sql immutable as $$
  select p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
$$;

-- Save this device for the caller. A device that changed hands moves to the new person.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_topics text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.push_endpoint_ok(p_endpoint) then raise exception 'push service not supported'; end if;
  if (select count(*) from public.push_subscriptions s where s.user_id = auth.uid() and s.endpoint <> p_endpoint) >= 5 then
    raise exception 'too many devices';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, topics)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_topics, '{}'))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, topics = excluded.topics,
    last_sent_on = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.last_sent_on end;
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text[]) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[]) to authenticated;

-- Server-only state: VAPID keys (made by the push function on first use) and cursors.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private_jwk jsonb,
  last_news_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_config enable row level security;   -- no policies: service role only
revoke all on public.push_config from anon, authenticated;
insert into public.push_config(id) values (1) on conflict do nothing;

-- The scheduler's key for the push function, kept in Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_cron_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_key');
  end if;
end $$;
create or replace function public.push_cron_key() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_key';
$$;
revoke execute on function public.push_cron_key() from public, anon, authenticated;
grant execute on function public.push_cron_key() to service_role;

-- ---------- "delete my data" also clears community data ----------
create or replace function public.delete_my_training_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); w int; b int; p int; a int; k int; c int; s int;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  delete from workouts where user_id = v_uid;        get diagnostics w = row_count;   -- sets cascade
  delete from body_metrics where user_id = v_uid;    get diagnostics b = row_count;
  delete from pr_bells where user_id = v_uid;        get diagnostics p = row_count;   -- kudos on them cascade
  delete from ai_messages where user_id = v_uid;     get diagnostics a = row_count;
  delete from pr_kudos where user_id = v_uid;        get diagnostics k = row_count;
  delete from club_lifts where user_id = v_uid;      get diagnostics c = row_count;
  delete from season_members where user_id = v_uid;  get diagnostics s = row_count;
  return jsonb_build_object('workouts', w, 'measurements', b, 'pr_bells', p, 'messages', a,
                            'kudos', k, 'club', c, 'seasons', s);
end $$;
revoke execute on function public.delete_my_training_data() from public, anon;
grant execute on function public.delete_my_training_data() to authenticated;

-- ---------- offline-safe logging: the phone chooses the ids, so a retry never duplicates ----------
-- (workouts.id and workout_sets.id already accept client-made uuids; upserts use ignoreDuplicates.)

-- ---------- migration: wave2_push_schedule ----------
-- Members to tell "it's quiet now": subscribed to quiet alerts, usually check in within the
-- next two hours (their most common hour over 8 weeks, at least 3 visits), not in today yet.
create or replace function public.push_quiet_targets(p_hour int)
returns table (user_id uuid, usual_hour int)
language sql stable security definer set search_path = public as $$
  with subs as (select distinct s.user_id from public.push_subscriptions s where 'quiet' = any(s.topics)),
  h as (
    select c.user_id, extract(hour from c.checked_in_at at time zone 'Europe/Zagreb')::int hr, count(*) n
      from public.check_ins c join subs on subs.user_id = c.user_id
     where c.checked_in_at > now() - interval '8 weeks' group by 1, 2
  ),
  usual as (select distinct on (h.user_id) h.user_id, h.hr from h where h.n >= 3 order by h.user_id, h.n desc, h.hr)
  select u.user_id, u.hr from usual u
   where u.hr between p_hour and p_hour + 2
     and not exists (select 1 from public.check_ins c where c.user_id = u.user_id
                      and (c.checked_in_at at time zone 'Europe/Zagreb')::date = public.zagreb_today());
$$;
revoke execute on function public.push_quiet_targets(int) from public, anon, authenticated;
grant execute on function public.push_quiet_targets(int) to service_role;

-- Every 15 minutes the database asks the push function to check for news or a quiet gym.
-- The anon key is the public one from js/config.js; the Vault key is what authorises the call.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;   -- its functions live in schema net
select cron.unschedule(jobid) from cron.job where jobname = 'push-tick';
select cron.schedule('push-tick', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://oftgleobgcqdavnabfzr.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdGdsZW9iZ2NxZGF2bmFiZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjkxODEsImV4cCI6MjEwNTk0NTE4MX0.ZeemjR_UXcfU6-fIPSVJEXiGQUO7rTshO09iAEfw8GY',
      'x-push-key', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_key')),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 20000);
$cron$);

-- ---------- migration: wave2_advisor_fixes ----------
alter function public.push_endpoint_ok(text) set search_path = public;
create index if not exists seasons_created_by_idx on public.seasons(created_by);
