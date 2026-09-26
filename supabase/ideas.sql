-- =====================================================================
-- Ideas lab (migration: ideas_lab)
-- Admins (Zrinko) shape an idea with the idea agent; a finished brief is
-- queued for Nero, which implements it on a schedule.
-- Autonomy is per category and can only be raised by an owner (Toni):
-- owners live in app_owners, which no API role can write.
-- =====================================================================

create table public.app_owners (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_owners enable row level security;
create policy "owners read self" on public.app_owners for select using (user_id = (select auth.uid()));
-- no insert/update/delete policies: owners are added in the SQL editor only.

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_owners where user_id = auth.uid());
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- What Nero may ship without Toni. 'data' (database, security rules, auth,
-- roles, payments, health data) is never auto-shipped, whatever this table says.
create table public.idea_autonomy (
  category text primary key check (category in ('content','style','feature','data')),
  auto_ship boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint data_never_auto check (category <> 'data' or auto_ship = false)
);
insert into public.idea_autonomy(category, auto_ship) values
  ('content', true),   -- texts, translations, prices shown in copy
  ('style',   true),   -- layout, colours within the palette, spacing
  ('feature', false),  -- new screens or behaviour without database changes
  ('data',    false);
alter table public.idea_autonomy enable row level security;
create policy "autonomy admin read"  on public.idea_autonomy for select using (public.is_admin());
create policy "autonomy owner write" on public.idea_autonomy for update using (public.is_owner()) with check (public.is_owner());

create table public.idea_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default '',
  status text not null default 'drafting'
    check (status in ('drafting','queued','in_progress','shipped','needs_toni','rejected')),
  category text check (category in ('content','style','feature','data')),
  brief jsonb,                 -- final brief written by the idea agent
  pr_url text,                 -- set by Nero
  result_note text,            -- set by Nero: what shipped or why it waits
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index idea_threads_author_idx on public.idea_threads(author_id);
create index idea_threads_status_idx on public.idea_threads(status) where archived_at is null;

create table public.idea_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.idea_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 4000),
  created_at timestamptz not null default now()
);
create index idea_messages_thread_idx on public.idea_messages(thread_id, id);

alter table public.idea_threads  enable row level security;
alter table public.idea_messages enable row level security;
-- Admins see all ideas; they create their own and may only move a thread
-- from drafting to queued (or back while nobody picked it up). Nero writes
-- with the service role, which bypasses RLS.
create policy "ideas admin read"   on public.idea_threads for select using (public.is_admin());
create policy "ideas admin create" on public.idea_threads for insert
  with check (public.is_admin() and author_id = (select auth.uid()) and status = 'drafting');
create policy "ideas author queue" on public.idea_threads for update
  using (public.is_admin() and author_id = (select auth.uid()) and status in ('drafting','queued'))
  with check (author_id = (select auth.uid()) and status in ('drafting','queued'));
create policy "idea msgs admin read" on public.idea_messages for select using (public.is_admin());
-- messages are written only by the idea-agent Edge Function (service role).

-- Authors cannot set Nero's fields or choose their own risk category.
-- Deliberately NOT security definer: current_user must be the calling role.
create or replace function public.guard_idea_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then
    new.updated_at := now(); return new;
  end if;
  if tg_op = 'INSERT' then
    new.brief := null; new.category := null; new.pr_url := null; new.result_note := null;
    new.archived_at := null; new.status := 'drafting';
    return new;
  end if;
  if new.brief is distinct from old.brief or new.category is distinct from old.category
     or new.pr_url is distinct from old.pr_url or new.result_note is distinct from old.result_note
     or new.archived_at is distinct from old.archived_at or new.author_id is distinct from old.author_id then
    raise exception 'only the idea agent or Nero can change these fields';
  end if;
  if new.status = 'queued' and old.brief is null then
    raise exception 'finish the conversation first: the brief is not ready';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.guard_idea_write() from public, anon, authenticated;
create trigger idea_threads_guard before insert or update on public.idea_threads
  for each row execute function public.guard_idea_write();

-- Hygiene, run by the scheduled Nero routine (service role):
-- archive finished ideas after 14 days, drop their chat after 90.
create or replace function public.ideas_housekeeping()
returns table (archived int, purged int) language plpgsql security definer set search_path = public as $$
declare a int; p int;
begin
  update idea_threads set archived_at = now()
   where archived_at is null and status in ('shipped','rejected') and updated_at < now() - interval '14 days';
  get diagnostics a = row_count;
  delete from idea_messages m using idea_threads t
   where m.thread_id = t.id and t.archived_at < now() - interval '90 days';
  get diagnostics p = row_count;
  -- drafts nobody touched for 60 days
  update idea_threads set archived_at = now()
   where archived_at is null and status = 'drafting' and updated_at < now() - interval '60 days';
  return query select a, p;
end $$;
revoke all on function public.ideas_housekeeping() from public, anon, authenticated;
grant execute on function public.ideas_housekeeping() to service_role;

-- Role guard fix: the SQL editor / service role could not change roles because the
-- old function was security definer (current_user was always the owner) and
-- auth.uid() is null there. Now: admins, or trusted server roles, may change roles;
-- the first-admin bootstrap is serialised; the last admin cannot be demoted.
create or replace function public.guard_role_change() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    if current_user in ('postgres','service_role','supabase_admin') or public.is_admin() then
      if old.role = 'admin' and new.role <> 'admin'
         and (select count(*) from profiles where role = 'admin') <= 1 then
        raise exception 'the gym needs at least one admin';
      end if;
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('first_admin'));
    if new.role = 'admin' and new.id = auth.uid()
       and not exists (select 1 from profiles where role = 'admin') then return new; end if;
    raise exception 'only an admin can change roles';
  end if;
  return new;
end $$;
revoke all on function public.guard_role_change() from public, anon, authenticated;

create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('first_admin'));
  if exists (select 1 from public.profiles where role = 'admin') then return false; end if;
  update public.profiles set role = 'admin' where id = auth.uid();
  return true;
end $$;

-- =====================================================================
-- Studio (migration: studio_posts)
-- Threads can be ideas or bug reports; posts are member news and/or
-- Instagram posts composed in the app.
-- =====================================================================
alter table public.idea_threads add column if not exists kind text not null default 'idea'
  check (kind in ('idea','bug'));

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  caption text not null default '' check (length(caption) <= 2200),
  title text not null default '' check (length(title) <= 120),       -- members news headline
  images text[] not null default '{}' check (cardinality(images) <= 10), -- paths in bucket "posts"
  aspect text not null default '4:5' check (aspect in ('1:1','4:5','1.91:1')),
  channels text[] not null default '{members}'
    check (channels <@ array['members','instagram']::text[]),
  status text not null default 'draft' check (status in ('draft','publishing','published','failed')),
  pinned boolean not null default false,
  ig_media_id text, ig_permalink text, error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts(published_at desc) where status = 'published';
alter table public.posts enable row level security;
create policy "posts members read" on public.posts for select
  using (public.is_admin() or (status = 'published' and 'members' = any(channels) and (select auth.uid()) is not null));
create policy "posts admin write" on public.posts for all using (public.is_admin()) with check (public.is_admin());

-- Only the social-publish function (service role) may mark posts published or store IG ids.
create or replace function public.guard_post_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.ig_media_id := null; new.ig_permalink := null; new.error := null;
    if new.status <> 'draft' then new.status := 'draft'; end if;
    new.published_at := null;
  elsif new.ig_media_id is distinct from old.ig_media_id or new.ig_permalink is distinct from old.ig_permalink
     or new.status is distinct from old.status or new.published_at is distinct from old.published_at then
    raise exception 'publish through the app';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.guard_post_write() from public, anon, authenticated;
create trigger posts_guard before insert or update on public.posts for each row execute function public.guard_post_write();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;
create policy "posts img public read"  on storage.objects for select using (bucket_id = 'posts');
create policy "posts img admin insert" on storage.objects for insert with check (bucket_id = 'posts' and public.is_admin());
create policy "posts img admin delete" on storage.objects for delete using (bucket_id = 'posts' and public.is_admin());
-- the Studio uploads with upsert, which also needs update
create policy "posts img admin update" on storage.objects for update using (bucket_id = 'posts' and public.is_admin()) with check (bucket_id = 'posts' and public.is_admin());

-- Instagram connection. No policies: only Edge Functions (service role) can read the token.
create table public.social_accounts (
  provider text primary key check (provider in ('instagram')),
  account_id text not null,          -- Instagram professional account id
  username text,
  access_token text not null,        -- long-lived token, refreshed automatically
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.social_accounts enable row level security;
create or replace function public.instagram_status()
returns table (connected boolean, username text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select true, username, expires_at from social_accounts where provider = 'instagram' and public.is_admin()
  union all select false, null, null
  where not exists (select 1 from social_accounts where provider = 'instagram') and public.is_admin();
$$;
revoke execute on function public.instagram_status() from public, anon;
grant execute on function public.instagram_status() to authenticated;

insert into public.site_settings(key, value) values ('hashtag_sets', null) on conflict (key) do nothing;
