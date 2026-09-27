-- migration: plans_readable_by_holder (applied)
-- A member must still see the package they hold after the gym hides it from the public list;
-- otherwise the embedded plan comes back null and the dashboard's pass card has no name.
-- The public offers strip filters to is_published itself, so hidden plans stay off the site.
create policy "plans own membership" on public.membership_plans for select
  using (exists (select 1 from public.memberships m
                 where m.plan_id = membership_plans.id and m.user_id = (select auth.uid())));
