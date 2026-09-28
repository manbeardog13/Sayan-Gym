-- =====================================================================
-- Passes at the desk (migration: desk_passes)
-- Admins give, extend and cancel memberships from the Front desk; every change
-- is kept in membership_log (who, when, how many days, which channel).
-- Renewing the same plan extends the member's current pass, so the QR code the
-- member already has keeps working. Dates follow Europe/Zagreb: a 30-day pass
-- given today runs to the end of day 30.
-- =====================================================================
create table if not exists public.membership_log (
  id bigint generated always as identity primary key,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('new', 'extend', 'cancel')),
  days int,
  source text,
  staff_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists membership_log_membership_idx on public.membership_log(membership_id);
create index if not exists membership_log_user_idx on public.membership_log(user_id);
create index if not exists membership_log_staff_idx on public.membership_log(staff_id);
alter table public.membership_log enable row level security;
create policy "membership log admin read" on public.membership_log for select using (public.is_admin());
-- written only by give_pass() and cancel_pass()

create or replace function public.give_pass(p_user uuid, p_plan uuid, p_days int, p_source text default 'desk')
returns table (membership_id uuid, ends_at timestamptz, extended boolean)
language plpgsql security definer set search_path = public as $$
declare v_kind text; v_id uuid; v_end timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_days is null or p_days not between 1 and 400 then raise exception 'days'; end if;
  if p_source not in ('desk', 'online', 'multisport') then raise exception 'source'; end if;
  select mp.kind into v_kind from public.membership_plans mp where mp.id = p_plan;
  if v_kind is null or v_kind = 'addon' then raise exception 'plan'; end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then raise exception 'member'; end if;

  -- the same plan still running: extend it (same pass code)
  select m.id, m.ends_at into v_id, v_end from public.memberships m
   where m.user_id = p_user and m.plan_id = p_plan and m.status = 'active' and m.ends_at > now()
   order by m.ends_at desc limit 1 for update;
  if v_id is not null then
    update public.memberships m set ends_at = m.ends_at + make_interval(days => p_days) where m.id = v_id
      returning m.ends_at into v_end;
    insert into public.membership_log(membership_id, user_id, action, days, source) values (v_id, p_user, 'extend', p_days, p_source);
    return query select v_id, v_end, true;
    return;
  end if;

  insert into public.memberships(user_id, plan_id, starts_at, ends_at, source)
  values (p_user, p_plan, now(), ((public.zagreb_today() + p_days)::timestamp at time zone 'Europe/Zagreb'), p_source)
  returning id, memberships.ends_at into v_id, v_end;
  insert into public.membership_log(membership_id, user_id, action, days, source) values (v_id, p_user, 'new', p_days, p_source);
  return query select v_id, v_end, false;
end $$;
revoke execute on function public.give_pass(uuid, uuid, int, text) from public, anon;
grant execute on function public.give_pass(uuid, uuid, int, text) to authenticated;

create or replace function public.cancel_pass(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.memberships m set status = 'cancelled' where m.id = p_membership and m.status = 'active' returning m.user_id into v_user;
  if v_user is null then raise exception 'not active'; end if;
  insert into public.membership_log(membership_id, user_id, action) values (p_membership, v_user, 'cancel');
end $$;
revoke execute on function public.cancel_pass(uuid) from public, anon;
grant execute on function public.cancel_pass(uuid) to authenticated;
