-- =====================================================================
-- Access audit: who can read and change what. Safe to run on the live project:
-- it creates two throwaway users and some data inside one transaction and ends
-- with RAISE EXCEPTION, so everything is rolled back. Paste into the Supabase
-- SQL editor and read the "RESULT" list in the error message.
--
-- Expected: every "member reads other …" and "anon reads …" line is 0 or "no access";
-- every write attempt is "refused" or 0 rows; "consent written for other" is 0
-- (a guard trigger files it under the caller instead); every staff/admin-only
-- function says "refused". Anything else is a finding.
-- =====================================================================
create temp table r(k text, v text);
grant all on r to authenticated, anon;
do $t$
declare m uuid := gen_random_uuid(); o uuid := gen_random_uuid(); w uuid := gen_random_uuid(); b bigint; plan uuid; res text; f record; sqlx text;
  reads text[] := array['workouts','workout_sets','body_metrics','consents','check_ins','memberships','profiles','push_subscriptions','return_codes','season_members','club_lifts','membership_log','staff_touches','idea_threads','idea_messages','ai_messages','app_owners','social_accounts','concierge_hits','push_config','quest_months'];
  t text;
begin
  insert into auth.users(id, email, aud, role) values (m,'audit-m@t.invalid','authenticated','authenticated'),(o,'audit-o@t.invalid','authenticated','authenticated');
  insert into public.profiles(id, display_name, role) values (m,'Audit Member','member'),(o,'Audit Other','member') on conflict (id) do update set role='member';
  select id into plan from public.membership_plans limit 1;
  -- data belonging to the other member
  insert into public.consents(user_id, purpose, text_version) values (o, 'health', 'audit');
  insert into public.body_metrics(user_id, measured_on, weight_kg) values (o, current_date, 80);
  insert into public.workouts(id, user_id, performed_on) values (w, o, current_date);
  insert into public.workout_sets(workout_id, exercise_id, set_no, load_kg, reps) select w, e.id, 1, 100, 5 from public.exercises e limit 1;
  insert into public.check_ins(user_id) values (o);
  insert into public.memberships(user_id, plan_id, ends_at) values (o, plan, now() + interval '10 days');
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role','authenticated')::text, true);
  insert into public.pr_bells(exercise_id, load_kg, reps) select e.id, 100, 5 from public.exercises e limit 1 returning id into b;

  -- 1. a signed-in member against someone else's data
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role','authenticated')::text, true);
  set local role authenticated;
  foreach t in array reads loop
    begin
      execute format('select count(*)::text from public.%I where %s', t,
        case when t = 'profiles' then format('id = %L', o)
             when t = 'workout_sets' then format('workout_id = %L', w)
             when t in ('idea_threads','idea_messages','social_accounts','concierge_hits','push_config','quest_months','app_owners','membership_log','staff_touches','ai_messages') then 'true'
             else format('user_id = %L', o) end) into res;
    exception when insufficient_privilege then res := 'no access'; end;
    insert into r values ('member reads other '||t, res);
  end loop;
  begin insert into public.workouts(user_id, performed_on) values (o, current_date); insert into r values ('member writes workout for other','ALLOWED'); exception when others then insert into r values ('member writes workout for other','refused'); end;
  begin insert into public.check_ins(user_id) values (m); insert into r values ('member checks self in','ALLOWED'); exception when others then insert into r values ('member checks self in','refused'); end;
  begin insert into public.memberships(user_id, plan_id, ends_at) values (m, plan, now()+interval '1 year'); insert into r values ('member gives self pass','ALLOWED'); exception when others then insert into r values ('member gives self pass','refused'); end;
  begin update public.profiles set role='admin' where id=m; insert into r values ('member makes self admin','ALLOWED'); exception when others then insert into r values ('member makes self admin','refused'); end;
  update public.profiles set display_name='x' where id=o; get diagnostics res = row_count; insert into r values ('member renames other (rows)', res);
  begin insert into public.consents(user_id, purpose, text_version) values (o, 'health', 'x'); exception when others then null; end;
  delete from public.pr_bells where id=b; get diagnostics res = row_count; insert into r values ('member deletes other bell (rows)', res);
  begin insert into public.pr_kudos(bell_id, user_id) values (b, o); insert into r values ('member gives kudos as other','ALLOWED'); exception when others then insert into r values ('member gives kudos as other','refused'); end;
  begin insert into storage.objects(bucket_id, name) values ('gallery','audit.jpg'); insert into r values ('member uploads to gallery','ALLOWED'); exception when others then insert into r values ('member uploads to gallery','refused'); end;
  update public.site_settings set value='https://evil.example' where key='payment_url'; get diagnostics res = row_count; insert into r values ('member edits site settings (rows)', res);
  reset role;
  select count(*)::text into res from public.consents where user_id = o and text_version = 'x'; insert into r values ('consent written for other (rows)', res);

  -- 2. every SECURITY DEFINER function a member can call
  set local role authenticated;
  for f in select p.proname, p.pronargs n from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
            and has_function_privilege('authenticated', p.oid, 'execute') and p.prorettype <> 'trigger'::regtype order by 1 loop
    if f.proname in ('claim_first_admin','delete_my_training_data','save_push_subscription') then continue; end if;
    sqlx := case
      when f.n = 0 then format('select count(*)::text from (select * from public.%I()) z', f.proname)
      when f.proname = 'give_pass' then format('select count(*)::text from public.give_pass(%L::uuid, gen_random_uuid(), 30, ''desk'')', o)
      when f.proname = 'cancel_pass' then 'select public.cancel_pass(gen_random_uuid())::text'
      when f.proname = 'redeem_return_code' then 'select count(*)::text from public.redeem_return_code(''BACK-000000'')'
      when f.proname = 'set_idea_archive' then 'select public.set_idea_archive(gen_random_uuid(), true)::text'
      when f.proname = 'create_season' then 'select public.create_season(''x'', current_date, 6, array[''a'',''b''])::text'
      when f.proname in ('has_consent','withdraw_consent') then format('select public.%I(''health'')::text', f.proname)
      else null end;
    if sqlx is null then insert into r values ('fn '||f.proname, 'NOT COVERED: add a call here'); continue; end if;
    begin execute sqlx into res; insert into r values ('fn '||f.proname, 'ok -> '||coalesce(res,'null'));
    exception when others then insert into r values ('fn '||f.proname, 'refused: '||left(sqlerrm, 40)); end;
  end loop;
  reset role;

  -- 3. a visitor who is not signed in
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  foreach t in array reads loop
    begin execute format('select count(*)::text from public.%I', t) into res; exception when insufficient_privilege then res := 'no access'; end;
    insert into r values ('anon reads '||t, res);
  end loop;
  select count(*)::text into res from public.posts; insert into r values ('anon reads posts', res);
  select count(*)::text into res from public.pr_bells; insert into r values ('anon reads bells', res);
  begin insert into public.check_ins(user_id) values (o); insert into r values ('anon inserts check-in','ALLOWED'); exception when others then insert into r values ('anon inserts check-in','refused'); end;
  reset role;
  raise exception 'RESULT %', (select string_agg(r.k||' = '||r.v, E'\n' order by r.k) from r);
end $t$;
