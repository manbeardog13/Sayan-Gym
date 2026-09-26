-- =====================================================================
-- Saiyan Gym FITT — complete database schema (reference copy)
-- Already applied to Supabase project "saiyan-gym-fitt" (oftgleobgcqdavnabfzr)
-- as migrations: core_schema, intelligence_engine, concierge_search,
-- harden_function_grants, recovery_uses_workout_date, goal_aware_progression.
-- Run this file only to rebuild the backend in a fresh project.
-- =====================================================================
create extension if not exists vector with schema extensions;

-- ---------------- profiles ----------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('member','coach','admin')),
  locale text not null default 'hr' check (locale in ('hr','en')),
  goal text check (goal in ('strength','hypertrophy','fat_loss','general')),
  experience text check (experience in ('beginner','intermediate','advanced')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('coach','admin'));
$$;

-- Creates a profile from the Google account name/photo on first sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------- plans & memberships ----------------
create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null check (kind in ('day','multi','month','year','addon')),
  name_hr text not null, name_en text not null,
  description_hr text, description_en text,
  price_eur numeric(8,2),                 -- null = "on request"
  duration_days int,
  is_published boolean not null default true,
  sort int not null default 0
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null default 'desk' check (source in ('desk','online','multisport')),
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  pass_code text unique not null default encode(gen_random_bytes(9),'hex'),
  created_at timestamptz not null default now()
);
create index on public.memberships(user_id);

-- ---------------- check-ins & occupancy ----------------
create table public.check_ins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz
);
create index on public.check_ins(user_id, checked_in_at desc);
create index on public.check_ins(checked_in_at desc);

-- Aggregate only (no personal data) — intentionally public.
create or replace function public.current_occupancy()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.check_ins
  where checked_out_at is null and checked_in_at > now() - interval '3 hours';
$$;
create or replace function public.occupancy_heatmap()
returns table (dow int, hour int, avg_visits numeric)
language sql stable security definer set search_path = public as $$
  select extract(isodow from checked_in_at at time zone 'Europe/Zagreb')::int,
         extract(hour from checked_in_at at time zone 'Europe/Zagreb')::int,
         round(count(*)::numeric / 8, 1)
  from public.check_ins where checked_in_at > now() - interval '8 weeks'
  group by 1,2 order by 1,2;
$$;

-- ---------------- training ----------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_hr text not null, name_en text not null,
  muscle_group text not null,
  is_compound boolean not null default false,
  increment_kg numeric(4,2) not null default 2.5
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  performed_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.workouts(user_id, performed_on desc);
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  set_no int not null default 1,
  reps int not null check (reps between 1 and 100),
  load_kg numeric(6,2) not null check (load_kg >= 0 and load_kg <= 600),
  rpe numeric(3,1) check (rpe between 5 and 10),
  created_at timestamptz not null default now()
);
create index on public.workout_sets(workout_id);
create index on public.workout_sets(exercise_id);

-- ---------------- GDPR consent & health data (Art. 9) ----------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  purpose text not null check (purpose in ('health','ai_coach','marketing')),
  text_version text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index on public.consents(user_id, purpose);
create or replace function public.has_consent(p_purpose text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.consents
    where user_id = auth.uid() and purpose = p_purpose and withdrawn_at is null);
$$;
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  measured_on date not null default current_date,
  weight_kg numeric(5,2),
  bodyfat_pct numeric(4,1),
  created_at timestamptz not null default now()
);

-- ---------------- AI & content ----------------
create table public.ai_messages (   -- reserved for a future generative coach
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create table public.gym_facts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  content_hr text not null, content_en text not null,
  embedding extensions.vector(384)
);
create table public.motivation (id serial primary key, text_hr text not null, text_en text not null);

create or replace function public.match_gym_facts(query_embedding extensions.vector(384), match_count int default 3)
returns table (topic text, content_hr text, content_en text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select topic, content_hr, content_en, 1 - (embedding <=> query_embedding)
  from public.gym_facts where embedding is not null
  order by embedding <=> query_embedding limit match_count;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.membership_plans enable row level security;
alter table public.memberships      enable row level security;
alter table public.check_ins        enable row level security;
alter table public.exercises        enable row level security;
alter table public.workouts         enable row level security;
alter table public.workout_sets     enable row level security;
alter table public.consents         enable row level security;
alter table public.body_metrics     enable row level security;
alter table public.ai_messages      enable row level security;
alter table public.gym_facts        enable row level security;
alter table public.motivation       enable row level security;

create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "own profile update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "staff profile update" on public.profiles for update using (public.is_staff());

create policy "plans public"      on public.membership_plans for select using (is_published or public.is_staff());
create policy "plans staff write" on public.membership_plans for all using (public.is_staff()) with check (public.is_staff());
create policy "exercises public"  on public.exercises for select using (true);
create policy "exercises staff"   on public.exercises for all using (public.is_staff()) with check (public.is_staff());
create policy "facts public"      on public.gym_facts for select using (true);
create policy "facts staff"       on public.gym_facts for all using (public.is_staff()) with check (public.is_staff());
create policy "motivation public" on public.motivation for select using (true);

create policy "memberships read"  on public.memberships for select using (user_id = auth.uid() or public.is_staff());
create policy "memberships staff" on public.memberships for all using (public.is_staff()) with check (public.is_staff());
create policy "checkins read"     on public.check_ins for select using (user_id = auth.uid() or public.is_staff());
create policy "checkins staff"    on public.check_ins for all using (public.is_staff()) with check (public.is_staff());

create policy "workouts own" on public.workouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workouts coach read" on public.workouts for select using (public.is_staff());
create policy "sets own" on public.workout_sets for all
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy "sets coach read" on public.workout_sets for select using (public.is_staff());

create policy "consents own" on public.consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "body own with consent" on public.body_metrics for all
  using (user_id = auth.uid() and public.has_consent('health'))
  with check (user_id = auth.uid() and public.has_consent('health'));
create policy "ai own" on public.ai_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Intelligence layer (runs in-database, no external AI calls)
-- =====================================================================
create or replace function public.e1rm(p_load numeric, p_reps int)
returns numeric language sql immutable set search_path = public as $$
  select round(case when p_reps = 1 then p_load else p_load * (1 + p_reps / 30.0) end, 1);
$$;

-- Power Level: XP = volume/100 + 40·sessions + 150·PRs + 75·week streak
create or replace function public.my_power_level()
returns table (xp bigint, level int, tier text, next_tier text, next_tier_xp bigint,
               total_volume_kg numeric, training_days int, prs int, week_streak int)
language plpgsql stable security invoker set search_path = public as $$
declare v_vol numeric; v_days int; v_prs int; v_xp bigint; v_streak int := 0; v_wk date;
begin
  select coalesce(sum(s.reps * s.load_kg),0), count(distinct w.performed_on) into v_vol, v_days
  from workouts w join workout_sets s on s.workout_id = w.id where w.user_id = auth.uid();

  select count(*) into v_prs from (
    select public.e1rm(s.load_kg, s.reps) e,
           max(public.e1rm(s.load_kg, s.reps)) over (partition by s.exercise_id order by w.performed_on, s.created_at
             rows between unbounded preceding and 1 preceding) prev_best
    from workouts w join workout_sets s on s.workout_id = w.id where w.user_id = auth.uid()
  ) t where prev_best is not null and e > prev_best;

  v_wk := date_trunc('week', current_date)::date;
  if not exists (select 1 from workouts where user_id = auth.uid() and date_trunc('week', performed_on)::date = v_wk) then
    v_wk := v_wk - 7;
  end if;
  while exists (select 1 from workouts where user_id = auth.uid() and date_trunc('week', performed_on)::date = v_wk) loop
    v_streak := v_streak + 1; v_wk := v_wk - 7;
  end loop;

  v_xp := floor(v_vol / 100)::bigint + v_days * 40 + v_prs * 150 + v_streak * 75;
  return query select v_xp, (floor(sqrt(v_xp / 10.0)) + 1)::int,
    case when v_xp >= 40000 then 'LIMITLESS' when v_xp >= 15000 then 'ASCENDED'
         when v_xp >= 5000 then 'OVERDRIVE' when v_xp >= 1000 then 'SURGE' else 'SPARK' end,
    case when v_xp >= 40000 then null when v_xp >= 15000 then 'LIMITLESS'
         when v_xp >= 5000 then 'ASCENDED' when v_xp >= 1000 then 'OVERDRIVE' else 'SURGE' end,
    case when v_xp >= 40000 then null when v_xp >= 15000 then 40000::bigint
         when v_xp >= 5000 then 15000::bigint when v_xp >= 1000 then 5000::bigint else 1000::bigint end,
    round(v_vol, 0), v_days, v_prs, v_streak;
end $$;

-- Progressive overload coach: double progression within the member's goal rep range.
-- strength 3–6, hypertrophy 8–12, fat_loss 10–15, general/unset 6–10. Hold if last RPE >= 9.5.
create or replace function public.my_next_targets()
returns table (exercise_id uuid, name_hr text, name_en text, muscle_group text,
  last_date date, last_load numeric, last_reps int, last_rpe numeric,
  suggest_load numeric, suggest_reps int, e1rm numeric, e1rm_trend numeric, advice text)
language sql stable security invoker set search_path = public as $$
  with g as (
    select case goal when 'strength' then 3 when 'hypertrophy' then 8 when 'fat_loss' then 10 else 6 end lo,
           case goal when 'strength' then 6 when 'hypertrophy' then 12 when 'fat_loss' then 15 else 10 end hi
    from (select (select goal from profiles where id = auth.uid()) goal) x
  ),
  sessions as (
    select s.exercise_id, w.performed_on, max(s.load_kg) top_load,
           min(s.reps) filter (where s.load_kg = (select max(s2.load_kg) from workout_sets s2
                               where s2.workout_id = w.id and s2.exercise_id = s.exercise_id)) min_reps_at_top,
           max(s.rpe) max_rpe, max(public.e1rm(s.load_kg, s.reps)) best_e1rm,
           row_number() over (partition by s.exercise_id order by w.performed_on desc) rn
    from workouts w join workout_sets s on s.workout_id = w.id
    where w.user_id = auth.uid() and w.performed_on > current_date - 56
    group by s.exercise_id, w.performed_on, w.id
  ),
  last as (select * from sessions where rn = 1),
  prev as (select exercise_id, best_e1rm from sessions where rn = 3)
  select e.id, e.name_hr, e.name_en, e.muscle_group, l.performed_on, l.top_load, l.min_reps_at_top, l.max_rpe,
    case when coalesce(l.max_rpe,0) >= 9.5 then l.top_load
         when l.min_reps_at_top >= g.hi then l.top_load + e.increment_kg else l.top_load end,
    case when coalesce(l.max_rpe,0) >= 9.5 then l.min_reps_at_top
         when l.min_reps_at_top >= g.hi then g.lo
         else greatest(g.lo, least(l.min_reps_at_top + 1, g.hi)) end,
    l.best_e1rm, round(l.best_e1rm - p.best_e1rm, 1),
    case when coalesce(l.max_rpe,0) >= 9.5 then 'hold'
         when l.min_reps_at_top >= g.hi then 'add_load' else 'add_rep' end
  from last l join exercises e on e.id = l.exercise_id cross join g
  left join prev p on p.exercise_id = l.exercise_id
  order by l.performed_on desc, e.is_compound desc;
$$;

-- Muscle recovery: 72 h to full, based on the workout date (back-dated logs stay correct).
create or replace function public.my_recovery()
returns table (muscle_group text, last_trained timestamptz, recovery_pct int)
language sql stable security invoker set search_path = public as $$
  with t as (
    select e.muscle_group,
           max(least(s.created_at, ((w.performed_on + time '18:00') at time zone 'Europe/Zagreb'))) trained
    from workouts w join workout_sets s on s.workout_id = w.id join exercises e on e.id = s.exercise_id
    where w.user_id = auth.uid() and w.performed_on > current_date - 14
    group by e.muscle_group
  )
  select muscle_group, trained,
         least(100, greatest(0, round(extract(epoch from (now() - trained)) / 3600 / 72 * 100)))::int
  from t order by 3;
$$;

-- Churn radar (staff only): absence, falling visit frequency, expiring pass, first 90 days.
create or replace function public.churn_radar()
returns table (user_id uuid, display_name text, days_since_visit int, visits_4w int, visits_prev_4w int,
  membership_ends timestamptz, is_new boolean, risk_score int, risk text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return query
  with m as (
    select distinct on (ms.user_id) ms.user_id, ms.ends_at, ms.starts_at
    from memberships ms where ms.status = 'active' order by ms.user_id, ms.ends_at desc nulls first
  ), v as (
    select m.user_id, p.display_name, m.ends_at, m.starts_at,
      coalesce(extract(day from now() - (select max(c.checked_in_at) from check_ins c where c.user_id = m.user_id))::int, 99) dsv,
      (select count(*) from check_ins c where c.user_id = m.user_id and c.checked_in_at > now() - interval '28 days')::int v4,
      (select count(*) from check_ins c where c.user_id = m.user_id
         and c.checked_in_at between now() - interval '56 days' and now() - interval '28 days')::int vp4
    from m join profiles p on p.id = m.user_id
  ), s as (
    select v.*, least(100, least(45, dsv * 3)
      + case when vp4 > 0 and v4 < vp4 then round(30.0 * (vp4 - v4) / vp4)::int else 0 end
      + case when ends_at is not null and ends_at < now() + interval '10 days' then 15 else 0 end
      + case when starts_at > now() - interval '90 days' then 10 else 0 end)::int score
    from v
  )
  select s.user_id, s.display_name, s.dsv, s.v4, s.vp4, s.ends_at, s.starts_at > now() - interval '90 days', s.score,
         case when s.score >= 60 then 'high' when s.score >= 30 then 'medium' else 'low' end
  from s order by s.score desc;
end $$;

-- =====================================================================
-- Function grants (hardened after Supabase security advisor review)
-- =====================================================================
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.churn_radar() from public, anon;
revoke execute on function public.match_gym_facts(extensions.vector, int) from public, anon, authenticated;
grant  execute on function public.match_gym_facts(extensions.vector, int) to service_role;
revoke execute on function public.has_consent(text) from public, anon;
revoke execute on function public.my_power_level()  from public, anon;
revoke execute on function public.my_next_targets() from public, anon;
revoke execute on function public.my_recovery()     from public, anon;
grant execute on function public.my_power_level(), public.my_next_targets(), public.my_recovery(), public.churn_radar() to authenticated;
grant execute on function public.current_occupancy(), public.occupancy_heatmap() to anon, authenticated;

-- =====================================================================
-- Admin self-service (migration: admin_self_service)
-- Lets the owner fill in prices, photos, payment link and answers later.
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
-- First signed-in person can claim admin while no admin exists; refuses afterwards.
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.profiles where role = 'admin') then return false; end if;
  update public.profiles set role = 'admin' where id = auth.uid();
  return true;
end $$;
create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;
revoke execute on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;
revoke execute on function public.admin_exists() from public, anon;
grant execute on function public.admin_exists() to authenticated;

create table public.site_settings (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.site_settings enable row level security;
create policy "settings public" on public.site_settings for select using (true);
create policy "settings admin"  on public.site_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.site_settings(key, value) values ('payment_url', null), ('monthly_note', null);

drop policy "plans staff write" on public.membership_plans;
create policy "plans admin write" on public.membership_plans for all using (public.is_admin()) with check (public.is_admin());
drop policy "facts staff" on public.gym_facts;
create policy "facts admin" on public.gym_facts for all using (public.is_admin()) with check (public.is_admin());
create policy "motivation admin" on public.motivation for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "gallery public read"  on storage.objects for select using (bucket_id = 'gallery');
create policy "gallery admin insert" on storage.objects for insert with check (bucket_id = 'gallery' and public.is_admin());
create policy "gallery admin delete" on storage.objects for delete using (bucket_id = 'gallery' and public.is_admin());

-- ============================================================
-- Review-loop migrations (applied 2026-09-26)
-- ============================================================
-- churn_radar_never_visited: measure from membership start when a member never checked in; expose never_visited.
-- guard_role_changes: only an admin may change profiles.role (first-admin bootstrap still allowed).
create or replace function public.guard_role_change() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    if public.is_admin() then return new; end if;
    if new.role = 'admin' and new.id = auth.uid()
       and not exists (select 1 from profiles where role = 'admin') then return new; end if;
    raise exception 'only an admin can change roles';
  end if;
  return new;
end $$;
revoke all on function public.guard_role_change() from public, anon, authenticated;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles for each row execute function public.guard_role_change();
-- rls_initplan_and_fk_indexes: auth.uid() wrapped in (select …) in 9 policies; indexes on 3 foreign keys.
create index if not exists ai_messages_user_id_idx on public.ai_messages(user_id);
create index if not exists body_metrics_user_id_idx on public.body_metrics(user_id);
create index if not exists memberships_plan_id_idx on public.memberships(plan_id);
-- Full current definitions: see `supabase db dump` or the Supabase migrations list.
-- gym_facts_example_questions: example questions per fact (HR + EN) are embedded with the answer;
-- new 'payment' fact routes payment questions to the desk / WhatsApp until the payment setup is known.
alter table public.gym_facts add column if not exists questions text not null default '';
