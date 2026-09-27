-- =====================================================================
-- "Delete my data" (migration: delete_my_training_data)
-- Deletes the caller's training data in one call: workouts (and their sets),
-- body measurements, PR bells and assistant messages. Account deletion (which
-- also removes profile, membership, visits and consents via ON DELETE CASCADE)
-- is the Edge Function "delete-account".
-- =====================================================================
create or replace function public.delete_my_training_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); w int; b int; p int; a int;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  delete from workouts where user_id = v_uid;      get diagnostics w = row_count;   -- sets cascade
  delete from body_metrics where user_id = v_uid;  get diagnostics b = row_count;
  delete from pr_bells where user_id = v_uid;      get diagnostics p = row_count;
  delete from ai_messages where user_id = v_uid;   get diagnostics a = row_count;
  return jsonb_build_object('workouts', w, 'measurements', b, 'pr_bells', p, 'messages', a);
end $$;
revoke execute on function public.delete_my_training_data() from public, anon;
grant execute on function public.delete_my_training_data() to authenticated;
