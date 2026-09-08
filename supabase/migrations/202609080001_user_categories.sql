-- Categories become user-level (a common set shared across a user's sites).
-- A category row is user-level when site_id IS NULL; ownership is created_by.
-- Legacy per-site rows (site_id NOT NULL) keep working and stay referencable.

-- 1) Replace the per-site-only name-unique index with scoped partial indexes.
drop index if exists public.categories_site_name_key;

create unique index categories_site_name_key on public.categories (site_id, lower(name))
  where site_id is not null;

create unique index categories_user_name_key on public.categories (created_by, lower(name))
  where site_id is null;

-- 2) Backfill one user-level category per owner/name from existing site rows.
insert into public.categories (name, type, is_default, is_active, created_by, created_at)
select c.name, c.type, bool_or(c.is_default) as is_default, true, s.owner_id, min(c.created_at)
from public.categories c
join public.sites s on s.id = c.site_id
where c.is_active
  and not exists (
    select 1 from public.categories u
    where u.created_by = s.owner_id and u.site_id is null and lower(u.name) = lower(c.name)
  )
group by c.name, c.type, s.owner_id;

-- 3) Stop seeding per-site defaults on new sites; seed user-level defaults instead.
drop trigger if exists on_site_created_seed_categories on public.sites;
drop function if exists public.seed_site_categories();

create or replace function public.seed_user_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role = 'builder' then
    insert into public.categories (name, type, is_default, is_active, created_by)
    select d.name, d.type, true, true, new.id
    from (values
      ('Materials', 'expense'),
      ('Labour', 'expense'),
      ('Equipment', 'expense'),
      ('Transport', 'expense'),
      ('Subcontractor', 'expense'),
      ('Permits and Fees', 'expense'),
      ('Utilities', 'expense'),
      ('Miscellaneous', 'expense'),
      ('Client payment', 'income'),
      ('Advance', 'income'),
      ('Loan', 'income'),
      ('Refund', 'income')
    ) as d(name, type)
    where not exists (
      select 1 from public.categories u
      where u.created_by = new.id and u.site_id is null and lower(u.name) = lower(d.name)
    );
  end if;
  return new;
end;
$$;

create trigger on_profile_created_seed_categories
  after insert on public.profiles
  for each row execute procedure public.seed_user_categories();

-- 4) RLS for user-level categories (site-level legacy policies stay intact).
create policy "Users can read own categories" on public.categories
  for select using (site_id is null and created_by = auth.uid());

create policy "Users can read site owner categories" on public.categories
  for select using (
    site_id is null
    and exists (
      select 1 from public.sites s
      where s.owner_id = created_by and public.is_site_member(s.id)
    )
  );

create policy "Users can create own categories" on public.categories
  for insert with check (site_id is null and created_by = auth.uid());

create policy "Users can update own categories" on public.categories
  for update using (site_id is null and created_by = auth.uid())
  with check (site_id is null and created_by = auth.uid());