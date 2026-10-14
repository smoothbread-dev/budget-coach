-- Budget Coach — security & integrity migration.
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run.

-- ─────────────────────────────────────────
-- 1. Row-Level Security: every table is private to its owner
-- ─────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_defaults', 'recurring_items', 'month_plans',
    'savings_categories', 'savings_adjustments', 'plan_savings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ─────────────────────────────────────────
-- 2. Foreign keys
--    savings_adjustments → deleted with their category (CASCADE)
--    plan_savings        → kept, category link cleared (SET NULL); category_name preserves the label
-- ─────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid in ('public.savings_adjustments'::regclass, 'public.plan_savings'::regclass)
      and a.attname = 'savings_category_id'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- Remove rows that already point at deleted categories, so the constraints can be added.
delete from public.savings_adjustments sa
where not exists (select 1 from public.savings_categories c where c.id = sa.savings_category_id);

alter table public.plan_savings alter column savings_category_id drop not null;
update public.plan_savings ps set savings_category_id = null
where savings_category_id is not null
  and not exists (select 1 from public.savings_categories c where c.id = ps.savings_category_id);

alter table public.savings_adjustments
  add constraint savings_adjustments_category_fk
  foreign key (savings_category_id) references public.savings_categories (id) on delete cascade;

alter table public.plan_savings
  add constraint plan_savings_category_fk
  foreign key (savings_category_id) references public.savings_categories (id) on delete set null;

-- ─────────────────────────────────────────
-- 3. (Optional) Remove allocations left behind by months deleted before this fix.
--    Review first: this also removes allocations for months that never had a saved plan.
-- ─────────────────────────────────────────
-- delete from public.plan_savings ps
-- where not exists (
--   select 1 from public.month_plans mp
--   where mp.user_id = ps.user_id and mp.month_key = ps.month_key
-- );

-- ─────────────────────────────────────────
-- 4. (Optional) The "actual spending" upload feature was removed.
--    Uncomment to delete its table and data permanently.
-- ─────────────────────────────────────────
-- drop table if exists public.actual_spending;
