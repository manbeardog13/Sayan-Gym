-- =====================================================================
-- Wave 3: trip passport and Google review link (migration: wave3_trip)
-- * review_url: the gym's Google "write a review" link, set by an admin. Every
--   member sees the same neutral prompt after a visit; it is never tied to an
--   offer or shown only to happy members (Google's review policy).
-- * return_offer: optional text for returning visitors ("10% off your next day
--   pass"). Only when it is set does a member get a personal return code.
-- * return_codes: one code per member, redeemed once at the desk.
-- Passport stamps are read from the member's own check_ins (existing RLS).
-- =====================================================================
alter table public.site_settings add constraint site_settings_review_url_google
  check (key <> 'review_url' or value is null
         or (length(value) <= 500
             and value ~ '^https://(g\.page|search\.google\.com|(www\.|maps\.)?google\.(com|hr)|maps\.app\.goo\.gl)/[^[:space:]"''<>]*$'));
alter table public.site_settings add constraint site_settings_return_offer_len
  check (key <> 'return_offer' or value is null or length(value) between 1 and 140);
insert into public.site_settings(key, value) values ('review_url', null), ('return_offer', null) on conflict (key) do nothing;

create table if not exists public.return_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null
);
create index if not exists return_codes_redeemed_by_idx on public.return_codes(redeemed_by);
alter table public.return_codes enable row level security;
create policy "return codes read" on public.return_codes for select
  using (user_id = (select auth.uid()) or public.is_staff());
-- written only by my_return_code() and redeem_return_code()

-- The member's code, made on first ask. Needs an offer and at least one visit.
create or replace function public.my_return_code()
returns table (code text, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth'; end if;
  if coalesce((select s.value from public.site_settings s where s.key = 'return_offer'), '') = '' then return; end if;
  if not exists (select 1 from public.check_ins c where c.user_id = v_uid) then return; end if;
  insert into public.return_codes(user_id, code)
  values (v_uid, 'BACK-' || upper(encode(extensions.gen_random_bytes(3), 'hex')))
  on conflict (user_id) do nothing;
  return query select rc.code, rc.redeemed_at from public.return_codes rc where rc.user_id = v_uid;
end $$;
revoke execute on function public.my_return_code() from public, anon;
grant execute on function public.my_return_code() to authenticated;

-- Desk: look a code up and use it once. Returns who it belongs to and whether it was already used.
create or replace function public.redeem_return_code(p_code text)
returns table (display_name text, already_used boolean, used_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_at timestamptz; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if v_code !~ '^BACK-[0-9A-F]{6}$' then raise exception 'code'; end if;
  update public.return_codes rc set redeemed_at = now(), redeemed_by = auth.uid()
   where rc.code = v_code and rc.redeemed_at is null returning rc.user_id into v_user;
  if v_user is not null then
    return query select pr.display_name, false, now() from public.profiles pr where pr.id = v_user;
    return;
  end if;
  select rc.user_id, rc.redeemed_at into v_user, v_at from public.return_codes rc where rc.code = v_code;
  if v_user is null then raise exception 'not found'; end if;
  return query select pr.display_name, true, v_at from public.profiles pr where pr.id = v_user;
end $$;
revoke execute on function public.redeem_return_code(text) from public, anon;
grant execute on function public.redeem_return_code(text) to authenticated;
