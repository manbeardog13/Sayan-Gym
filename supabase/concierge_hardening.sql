-- =====================================================================
-- "Ask the gym" hardening (migration: concierge_hardening)
-- 1. Rate limiting for the public concierge function. Keys are one-day hashes
--    of the caller's IP (computed in the function), never raw addresses.
-- 2. match_gym_facts returns the fact id, so answers are matched by id and two
--    facts with the same topic name can no longer swap texts.
-- =====================================================================

create table if not exists public.concierge_hits (
  bucket text not null,              -- 'ip:<hash>' or 'all'
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);
alter table public.concierge_hits enable row level security;   -- no policies: service role only

-- true = allowed. Per visitor: 20 questions a minute. Whole gym: 600 an hour.
create or replace function public.concierge_allow(p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_min timestamptz := date_trunc('minute', now()); v_hour timestamptz := date_trunc('hour', now());
  v_ip int; v_all int;
begin
  insert into concierge_hits(bucket, window_start, hits) values ('ip:' || p_key, v_min, 1)
    on conflict (bucket, window_start) do update set hits = concierge_hits.hits + 1 returning hits into v_ip;
  insert into concierge_hits(bucket, window_start, hits) values ('all', v_hour, 1)
    on conflict (bucket, window_start) do update set hits = concierge_hits.hits + 1 returning hits into v_all;
  if random() < 0.02 then delete from concierge_hits where window_start < now() - interval '2 hours'; end if;
  return v_ip <= 20 and v_all <= 600;
end $$;
revoke all on function public.concierge_allow(text) from public, anon, authenticated;
grant execute on function public.concierge_allow(text) to service_role;

drop function if exists public.match_gym_facts(extensions.vector, int);
create function public.match_gym_facts(query_embedding extensions.vector(384), match_count int default 3)
returns table (id uuid, topic text, content_hr text, content_en text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select f.id, f.topic, f.content_hr, f.content_en, 1 - (f.embedding <=> query_embedding)
  from public.gym_facts f where f.embedding is not null
  order by f.embedding <=> query_embedding limit match_count;
$$;
revoke execute on function public.match_gym_facts(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_gym_facts(extensions.vector, int) to service_role;
