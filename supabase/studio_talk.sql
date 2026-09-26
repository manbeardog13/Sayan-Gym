-- Studio talk: Zrinko can archive and restore idea chats.
-- Auto-archive is quiet and keeps the messages, so un-archive brings the chat back.
-- Run once in the Supabase SQL editor for project saiyan-gym-fitt.

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
  -- An admin may only flip the archive flag. Everything else stays with the agent or Claude.
  if public.is_admin()
     and new.author_id is not distinct from old.author_id
     and new.brief is not distinct from old.brief
     and new.category is not distinct from old.category
     and new.pr_url is not distinct from old.pr_url
     and new.result_note is not distinct from old.result_note
     and new.status is not distinct from old.status
     and new.title is not distinct from old.title
     and new.kind is not distinct from old.kind
     and new.archived_at is distinct from old.archived_at then
    new.updated_at := now();
    return new;
  end if;
  if new.brief is distinct from old.brief or new.category is distinct from old.category
     or new.pr_url is distinct from old.pr_url or new.result_note is distinct from old.result_note
     or new.archived_at is distinct from old.archived_at or new.author_id is distinct from old.author_id then
    raise exception 'only the idea agent or Claude can change these fields';
  end if;
  if new.status = 'queued' and old.brief is null then
    raise exception 'finish the conversation first: the brief is not ready';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Bypasses row rules so a finished idea can be archived or restored by any admin.
create or replace function public.set_idea_archive(p_id uuid, p_archive boolean)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.idea_threads
     set archived_at = case when p_archive then coalesce(archived_at, now()) else null end
   where id = p_id
  returning archived_at into ts;
  return ts;
end $$;
revoke all on function public.set_idea_archive(uuid, boolean) from public, anon;
grant execute on function public.set_idea_archive(uuid, boolean) to authenticated;

-- Smart archive: finished work after 7 days, quiet drafts after 21, stalled work after 45.
-- Messages stay, so opening the archive and restoring a chat shows the full history.
create or replace function public.ideas_auto_archive()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.idea_threads
     set archived_at = now()
   where archived_at is null
     and (
       (status in ('shipped','rejected') and updated_at < now() - interval '7 days')
       or (status = 'drafting' and updated_at < now() - interval '21 days')
       or (status in ('queued','in_progress','needs_toni') and updated_at < now() - interval '45 days')
     );
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ideas_auto_archive() from public, anon;
grant execute on function public.ideas_auto_archive() to authenticated;
