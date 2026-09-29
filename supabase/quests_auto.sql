-- =====================================================================
-- Default monthly quests (migration: quests_auto). Apply after the PR merges.
-- Three standard quests (all about showing up and logging, never kilos) are added
-- in the first week of each month, once per month. Deleting one keeps it deleted,
-- and site_settings.auto_quests = 'off' stops the automation. Admins can add the
-- standard set to the current month at any time (add_default_quests).
-- =====================================================================
create table if not exists public.quest_months (
  month date primary key check (extract(day from month) = 1),
  seeded_at timestamptz not null default now()
);
alter table public.quest_months enable row level security;
-- no policies: written only by seed_default_quests()

insert into public.site_settings(key, value) values ('auto_quests', 'on') on conflict (key) do nothing;
alter table public.site_settings add constraint site_settings_auto_quests_onoff
  check (key <> 'auto_quests' or value in ('on', 'off'));

create or replace function public.default_quest_rows(p_month date)
returns table (month date, kind text, target int, title_hr text, title_en text)
language sql immutable set search_path = public as $$
  values (p_month, 'days', 8, '8 dana treninga', 'Train on 8 days'),
         (p_month, 'strong_weeks', 3, '3 tjedna s 2+ treninga', '3 weeks with 2+ sessions'),
         (p_month, 'sets', 60, '60 upisanih serija', 'Log 60 sets')
$$;
revoke execute on function public.default_quest_rows(date) from public, anon, authenticated;

-- Scheduler: once per month, only in the month's first week, only if the month has no quests yet.
create or replace function public.seed_default_quests() returns int
language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', public.zagreb_today())::date; n int := 0;
begin
  if coalesce((select s.value from public.site_settings s where s.key = 'auto_quests'), 'on') = 'off' then return 0; end if;
  if public.zagreb_today() - v_m >= 7 then return 0; end if;
  insert into public.quest_months(month) values (v_m) on conflict (month) do nothing;
  if not found then return 0; end if;
  if exists (select 1 from public.quests q where q.month = v_m) then return 0; end if;
  insert into public.quests(month, kind, target, title_hr, title_en, created_by)
  select d.month, d.kind, d.target, d.title_hr, d.title_en, null from public.default_quest_rows(v_m) d;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.seed_default_quests() from public, anon, authenticated;

-- Admin button: add whichever standard quests the current month doesn't have yet.
create or replace function public.add_default_quests() returns int
language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', public.zagreb_today())::date; n int := 0;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.quests(month, kind, target, title_hr, title_en)
  select d.month, d.kind, d.target, d.title_hr, d.title_en from public.default_quest_rows(v_m) d
   where not exists (select 1 from public.quests q where q.month = v_m and q.kind = d.kind and q.exercise_id is null);
  get diagnostics n = row_count;
  insert into public.quest_months(month) values (v_m) on conflict (month) do nothing;
  return n;
end $$;
revoke execute on function public.add_default_quests() from public, anon;
grant execute on function public.add_default_quests() to authenticated;

-- Daily at 00:15 UTC (01:15/02:15 in Zagreb); the function itself decides whether to add anything.
select cron.schedule('monthly-quests', '15 0 * * *', $$select public.seed_default_quests()$$);
