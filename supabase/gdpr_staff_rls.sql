-- =====================================================================
-- GDPR consent records, health-data erasure, and staff write scope
-- (migration: gdpr_consent_health_staff_scope)
--
-- 1. Consents are an append-only record: members can read and grant their
--    own, never edit or delete them. Withdrawal goes through
--    withdraw_consent(), which only stamps withdrawn_at = now().   (Art. 7(1))
-- 2. Health data: withdrawing the health consent deletes the member's body
--    measurements, and members can always delete their own rows. (Art. 9, 17)
-- 3. Coaches get what the front desk needs (check in, check out); plans,
--    memberships, exercises, deleting visits and editing other people's
--    profiles are admin-only.
-- =====================================================================

-- ---------- 1. consents ----------
drop policy if exists "consents own" on public.consents;
create policy "consents own read"  on public.consents for select using (user_id = (select auth.uid()));
create policy "consents own grant" on public.consents for insert
  with check (user_id = (select auth.uid()) and withdrawn_at is null);

-- The database, not the browser, sets who and when.
create or replace function public.guard_consent_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  new.user_id := auth.uid();
  new.granted_at := now();
  new.withdrawn_at := null;
  if coalesce(trim(new.text_version), '') = '' then raise exception 'consent text version required'; end if;
  return new;
end $$;
revoke all on function public.guard_consent_insert() from public, anon, authenticated;
drop trigger if exists consents_guard_insert on public.consents;
create trigger consents_guard_insert before insert on public.consents
  for each row execute function public.guard_consent_insert();

-- One active consent per purpose.
create unique index if not exists consents_one_active_idx on public.consents(user_id, purpose) where withdrawn_at is null;

create or replace function public.withdraw_consent(p_purpose text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update consents set withdrawn_at = now()
   where user_id = auth.uid() and purpose = p_purpose and withdrawn_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.withdraw_consent(text) from public, anon;
grant execute on function public.withdraw_consent(text) to authenticated;

-- ---------- 2. health data ----------
-- Whenever a health consent is withdrawn (app, SQL editor or support), the
-- measurements it covered are erased.
create or replace function public.erase_health_on_withdraw() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.purpose = 'health' and old.withdrawn_at is null and new.withdrawn_at is not null
     and not exists (select 1 from consents c where c.user_id = new.user_id and c.purpose = 'health'
                     and c.withdrawn_at is null and c.id <> new.id) then
    delete from body_metrics where user_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function public.erase_health_on_withdraw() from public, anon, authenticated;
drop trigger if exists consents_erase_health on public.consents;
create trigger consents_erase_health after update of withdrawn_at on public.consents
  for each row execute function public.erase_health_on_withdraw();

drop policy if exists "body own with consent" on public.body_metrics;
create policy "body own read with consent" on public.body_metrics for select
  using (user_id = (select auth.uid()) and public.has_consent('health'));
create policy "body own add with consent" on public.body_metrics for insert
  with check (user_id = (select auth.uid()) and public.has_consent('health'));
create policy "body own edit with consent" on public.body_metrics for update
  using (user_id = (select auth.uid()) and public.has_consent('health'))
  with check (user_id = (select auth.uid()) and public.has_consent('health'));
create policy "body own delete always" on public.body_metrics for delete
  using (user_id = (select auth.uid()));

-- ---------- 3. staff scope ----------
-- memberships: staff still read (policy "memberships read"); only admins write.
drop policy if exists "memberships staff" on public.memberships;
create policy "memberships admin write" on public.memberships for all
  using (public.is_admin()) with check (public.is_admin());

-- check_ins: staff check people in and out; only admins delete or rewrite visits.
drop policy if exists "checkins staff" on public.check_ins;
create policy "checkins staff in"     on public.check_ins for insert with check (public.is_staff());
create policy "checkins staff out"    on public.check_ins for update using (public.is_staff()) with check (public.is_staff());
create policy "checkins admin delete" on public.check_ins for delete using (public.is_admin());

-- Coaches can't back-date a visit or rewrite who/when; admins and the server can.
create or replace function public.guard_checkin_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.checked_in_at := now(); new.checked_out_at := null;
  else
    if new.user_id is distinct from old.user_id or new.checked_in_at is distinct from old.checked_in_at then
      raise exception 'only an admin can change a visit';
    end if;
    if new.checked_out_at is not null then new.checked_out_at := now(); end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_checkin_write() from public, anon, authenticated;
drop trigger if exists check_ins_guard on public.check_ins;
create trigger check_ins_guard before insert or update on public.check_ins
  for each row execute function public.guard_checkin_write();

-- exercises: everyone reads (policy "exercises public"); only admins write.
drop policy if exists "exercises staff" on public.exercises;
create policy "exercises admin write" on public.exercises for all
  using (public.is_admin()) with check (public.is_admin());

-- profiles: members edit their own ("own profile update"); only admins edit others.
-- Role changes stay guarded by guard_role_change.
drop policy if exists "staff profile update" on public.profiles;
create policy "admin profile update" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------- migration: profiles_update_policy_no_recursion ----------
-- "own profile update" read profiles inside a profiles policy, which Postgres rejects as
-- infinite recursion, so no profile update could succeed. Role changes are already enforced
-- by the guard_role_change trigger, so the policy only needs to pin the row to the caller.
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- migrations: role_guard_sees_all_admins, role_guard_admin_count_grant ----------
-- The guard runs as the caller (so current_user identifies server roles), but its
-- "is there an admin?" checks then ran under the caller's RLS: a member cannot see the
-- admin's row, so the first-admin bootstrap branch let any member promote themselves.
-- (The old self-referencing profile policy masked this; it had to go because Postgres
-- rejected it as infinite recursion.) Count admins through a security-definer helper.
create or replace function public.admin_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles where role = 'admin';
$$;
revoke execute on function public.admin_count() from public, anon;
grant execute on function public.admin_count() to authenticated;   -- the guard runs as the caller

create or replace function public.guard_role_change() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('postgres','service_role','supabase_admin') or public.is_admin() then
      if old.role = 'admin' and new.role <> 'admin' and public.admin_count() <= 1 then
        raise exception 'the gym needs at least one admin';
      end if;
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('first_admin'));
    if new.role = 'admin' and new.id = auth.uid() and public.admin_count() = 0 then return new; end if;
    raise exception 'only an admin can change roles';
  end if;
  return new;
end $$;
revoke all on function public.guard_role_change() from public, anon, authenticated;
