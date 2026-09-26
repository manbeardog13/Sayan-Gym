-- =====================================================================
-- Wave 1 (migration: wave1_engagement)
-- Evidence-led changes (see RESEARCH.md): reward showing up, not junk volume;
-- a comeback bonus instead of punishing misses; rest tokens for the weekly
-- streak; first-4-in-4 onboarding; a daily "greet today" list for staff;
-- opt-in PR bell.
-- All dates use Europe/Zagreb, not the database's UTC date.
-- =====================================================================

-- ---------- staff touchpoints (feeds onboarding + greet list) ----------
create table if not exists public.staff_touches (
  id bigint generated always as identity primary key,
  member_id uuid not null references auth.users(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'greet' check (kind in ('greet','intro')),
  created_at timestamptz not null default now()
);
create index if not exists staff_touches_member_idx on public.staff_touches(member_id, created_at desc);
alter table public.staff_touches enable row level security;
create policy "touches staff read"   on public.staff_touches for select using (public.is_staff());
create policy "touches staff insert" on public.staff_touches for insert
  with check (public.is_staff() and staff_id = (select auth.uid()));

-- ---------- Power Level v2 ----------
-- XP = 50·training day + 100·week with ≥2 sessions + 150·PR + 80·comeback
--    + 75·week of streak + volume/500.
-- PR: the day's best e1RM (sets of ≤10 reps only) beats every earlier day's best.
-- Comeback: a session after ≥8 days without one.
-- Streak: consecutive Zagreb weeks with a session; up to 2 rest tokens per
-- calendar month bridge empty weeks that sit between training weeks.
drop function if exists public.my_power_level();
create function public.my_power_level()
returns table (xp bigint, level int, tier text, next_tier text, next_tier_xp bigint,
               total_volume_kg numeric, training_days int, prs int, week_streak int,
               tokens_left int, comebacks int, consistent_weeks int)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Zagreb')::date;
  v_vol numeric; v_days int; v_prs int; v_cw int; v_cb int; v_xp bigint;
  v_streak int := 0; v_wk date; v_k int; v_used jsonb := '{}'::jsonb; v_ok boolean; v_m text; i int;
begin
  select coalesce(sum(s.reps * s.load_kg), 0), count(distinct w.performed_on)
    into v_vol, v_days
    from workouts w join workout_sets s on s.workout_id = w.id where w.user_id = v_uid;

  select count(*) into v_prs from (
    select best, max(best) over (partition by exercise_id order by d rows between unbounded preceding and 1 preceding) prev
    from (select s.exercise_id, w.performed_on d, max(public.e1rm(s.load_kg, s.reps)) best
          from workouts w join workout_sets s on s.workout_id = w.id
          where w.user_id = v_uid and s.reps <= 10 group by 1, 2) x
  ) t where prev is not null and best > prev;

  select count(*) into v_cw from (
    select date_trunc('week', performed_on) from workouts where user_id = v_uid
    group by 1 having count(distinct performed_on) >= 2) z;

  select count(*) into v_cb from (
    select performed_on - lag(performed_on) over (order by performed_on) gap
    from (select distinct performed_on from workouts where user_id = v_uid) d) g
  where gap >= 8;

  -- weekly streak with rest tokens
  v_wk := date_trunc('week', v_today)::date;
  if not exists (select 1 from workouts where user_id = v_uid and date_trunc('week', performed_on)::date = v_wk) then
    v_wk := v_wk - 7;   -- this week is not over yet
  end if;
  for i in 1..520 loop
    if exists (select 1 from workouts where user_id = v_uid and date_trunc('week', performed_on)::date = v_wk) then
      v_streak := v_streak + 1; v_wk := v_wk - 7; continue;
    end if;
    exit when v_streak = 0;
    -- count empty weeks (max 2) before the next earlier training week
    v_k := 1;
    while v_k <= 2 and not exists (select 1 from workouts where user_id = v_uid
          and date_trunc('week', performed_on)::date = v_wk - 7 * v_k) loop v_k := v_k + 1; end loop;
    exit when v_k > 2;
    v_ok := true;
    for j in 0..v_k - 1 loop
      v_m := to_char(v_wk - 7 * j, 'YYYY-MM');
      if coalesce((v_used ->> v_m)::int, 0) >= 2 then v_ok := false; end if;
      v_used := jsonb_set(v_used, array[v_m], to_jsonb(coalesce((v_used ->> v_m)::int, 0) + 1));
    end loop;
    exit when not v_ok;
    v_streak := v_streak + v_k; v_wk := v_wk - 7 * v_k;
  end loop;

  v_xp := v_days * 50 + v_cw * 100 + v_prs * 150 + v_cb * 80 + v_streak * 75 + floor(v_vol / 500)::bigint;
  return query select v_xp, (floor(sqrt(v_xp / 10.0)) + 1)::int,
    case when v_xp >= 40000 then 'LIMITLESS' when v_xp >= 15000 then 'ASCENDED'
         when v_xp >= 5000 then 'OVERDRIVE' when v_xp >= 1000 then 'SURGE' else 'SPARK' end,
    case when v_xp >= 40000 then null when v_xp >= 15000 then 'LIMITLESS'
         when v_xp >= 5000 then 'ASCENDED' when v_xp >= 1000 then 'OVERDRIVE' else 'SURGE' end,
    case when v_xp >= 40000 then null when v_xp >= 15000 then 40000::bigint
         when v_xp >= 5000 then 15000::bigint when v_xp >= 1000 then 5000::bigint else 1000::bigint end,
    round(v_vol, 0), v_days, v_prs, v_streak,
    greatest(0, 2 - coalesce((v_used ->> to_char(v_today, 'YYYY-MM'))::int, 0)), v_cb, v_cw;
end $$;
revoke execute on function public.my_power_level() from public, anon;
grant execute on function public.my_power_level() to authenticated;

-- ---------- First 4 in 4 ----------
create or replace function public.my_onboarding()
returns table (days_in int, checkins int, workouts int, coach_intro boolean, show boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_join timestamptz; v_today date := (now() at time zone 'Europe/Zagreb')::date;
  v_d int; v_c int; v_w int; v_i boolean;
begin
  if v_uid is null then return; end if;
  select coalesce((select min(starts_at) from memberships where user_id = v_uid), p.created_at) into v_join
    from profiles p where p.id = v_uid;
  v_d := v_today - (v_join at time zone 'Europe/Zagreb')::date;
  select count(*) into v_c from check_ins where user_id = v_uid and checked_in_at >= v_join and checked_in_at < v_join + interval '28 days';
  select count(*) into v_w from workouts w where w.user_id = v_uid and w.performed_on >= (v_join at time zone 'Europe/Zagreb')::date
    and w.performed_on < (v_join at time zone 'Europe/Zagreb')::date + 28;
  v_i := exists (select 1 from staff_touches where member_id = v_uid and kind = 'intro');
  return query select v_d, v_c, v_w, v_i, (v_d <= 35 and not (v_c >= 4 and v_w >= 1 and v_i));
end $$;
revoke execute on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

-- ---------- Greet today (staff) ----------
-- Advisory list for a human; nothing is sent automatically (GDPR Art. 22).
create or replace function public.greet_today()
returns table (user_id uuid, display_name text, reason text, detail text, priority int)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Europe/Zagreb')::date;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return query
  with m as (
    select p.id, p.display_name,
           (coalesce((select min(ms.starts_at) from memberships ms where ms.user_id = p.id), p.created_at) at time zone 'Europe/Zagreb')::date joined
    from profiles p where p.role = 'member'
  ), touched as (
    select distinct member_id from staff_touches where created_at > now() - interval '5 days'
  ), pr as (
    select r.user_id, (select case when (select locale from profiles where id = r.user_id) = 'en' then e.name_en else e.name_hr end
                       from exercises e where e.id = r.exercise_id) ex, r.d
    from (select w.user_id, s.exercise_id, w.performed_on d, max(public.e1rm(s.load_kg, s.reps)) best,
                 max(max(public.e1rm(s.load_kg, s.reps))) over (partition by w.user_id, s.exercise_id order by w.performed_on
                   rows between unbounded preceding and 1 preceding) prev
          from workouts w join workout_sets s on s.workout_id = w.id where s.reps <= 10
          group by w.user_id, s.exercise_id, w.performed_on) r
    where r.d >= v_today - 3 and r.prev is not null and r.best > r.prev
  ), c as (
    select m.id, m.display_name, 'new_' || (v_today - m.joined) || 'd', null::text, 1 from m
      where v_today - m.joined in (7, 14, 30)
    union all
    select m.id, m.display_name, 'new_member', null, 2 from m
      where v_today - m.joined between 0 and 3
        and not exists (select 1 from staff_touches st where st.member_id = m.id and st.kind = 'intro')
    union all
    select r.user_id, r.display_name, 'drifting', r.days_since_visit::text, case r.risk when 'high' then 1 else 3 end
      from public.churn_radar() r where r.risk in ('high', 'medium')
    union all
    select pr.user_id, m.display_name, 'pr', pr.ex, 4 from pr join m on m.id = pr.user_id
  )
  select distinct on (c.id) c.id, c.display_name, c.reason, c.detail, c.priority
  from c where c.id not in (select member_id from touched)
  order by c.id, c.priority;
end $$;
revoke execute on function public.greet_today() from public, anon;
grant execute on function public.greet_today() to authenticated;

-- ---------- PR bell (opt-in, members see first name + lift for 14 days) ----------
create table if not exists public.pr_bells (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  first_name text not null default '',
  exercise_id uuid not null references public.exercises(id),
  load_kg numeric(6,2) not null check (load_kg > 0 and load_kg <= 600),
  reps int not null check (reps between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists pr_bells_recent_idx on public.pr_bells(created_at desc);
alter table public.pr_bells enable row level security;
create policy "bells members read" on public.pr_bells for select
  using ((select auth.uid()) is not null and created_at > now() - interval '14 days');
create policy "bells own insert" on public.pr_bells for insert with check (user_id = (select auth.uid()));
create policy "bells own delete" on public.pr_bells for delete using (user_id = (select auth.uid()));
create or replace function public.pr_bell_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.first_name := coalesce(split_part((select display_name from profiles where id = auth.uid()), ' ', 1), '');
  if (select count(*) from pr_bells where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'bell limit';
  end if;
  return new;
end $$;
revoke all on function public.pr_bell_fill() from public, anon, authenticated;
create trigger pr_bells_fill before insert on public.pr_bells for each row execute function public.pr_bell_fill();
