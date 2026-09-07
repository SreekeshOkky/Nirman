-- Nirmanam initial schema.
-- Apply with: supabase db push

create extension if not exists "pgcrypto";

create type public.app_role as enum ('builder', 'supervisor');
create type public.site_status as enum ('planning', 'active', 'on_hold', 'completed', 'archived');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');
create type public.entry_type as enum ('income', 'expense');
create type public.category_type as enum ('income', 'expense', 'both');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  role public.app_role not null default 'supervisor',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  location text,
  client_name text,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  start_date date,
  expected_end_date date,
  status public.site_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'supervisor' check (role = 'supervisor'),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'supervisor' check (role = 'supervisor'),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  type public.category_type not null default 'expense',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index categories_site_name_key on public.categories (coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  entry_type public.entry_type not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  entry_date date not null default current_date,
  description text not null default '',
  payment_method text,
  reference text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  ledger_entry_id uuid references public.ledger_entries(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  ledger_entry_id uuid references public.ledger_entries(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size integer,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sites_owner_id_idx on public.sites(owner_id);
create index site_members_user_site_idx on public.site_members(user_id, site_id);
create index ledger_entries_site_date_idx on public.ledger_entries(site_id, entry_date desc) where deleted_at is null;
create index ledger_entries_site_type_idx on public.ledger_entries(site_id, entry_type) where deleted_at is null;
create index ledger_entries_category_idx on public.ledger_entries(category_id);
create index notes_site_created_idx on public.notes(site_id, created_at desc);
create index audit_logs_site_created_idx on public.audit_logs(site_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger sites_updated_at before update on public.sites for each row execute procedure public.set_updated_at();
create trigger ledger_entries_updated_at before update on public.ledger_entries for each row execute procedure public.set_updated_at();
create trigger notes_updated_at before update on public.notes for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.seed_site_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (site_id, name, type, is_default) values
    (new.id, 'Materials', 'expense', true),
    (new.id, 'Labour', 'expense', true),
    (new.id, 'Equipment', 'expense', true),
    (new.id, 'Transport', 'expense', true),
    (new.id, 'Subcontractor', 'expense', true),
    (new.id, 'Permits and Fees', 'expense', true),
    (new.id, 'Utilities', 'expense', true),
    (new.id, 'Miscellaneous', 'expense', true),
    (new.id, 'Client payment', 'income', true),
    (new.id, 'Advance', 'income', true),
    (new.id, 'Loan', 'income', true),
    (new.id, 'Refund', 'income', true);
  return new;
end;
$$;

create trigger on_site_created_seed_categories after insert on public.sites for each row execute procedure public.seed_site_categories();

create or replace function public.is_site_owner(check_site_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.sites where id = check_site_id and owner_id = auth.uid()); $$;

create or replace function public.is_site_member(check_site_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_site_owner(check_site_id) or exists (select 1 from public.site_members where site_id = check_site_id and user_id = auth.uid()); $$;

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.site_members enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.notes enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read own profile" on public.profiles for select using (id = auth.uid());
create policy "Users can update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "Users can read accessible sites" on public.sites for select using (owner_id = auth.uid() or public.is_site_member(id));
create policy "Builders can create sites" on public.sites for insert with check (owner_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'builder'));
create policy "Builders can update owned sites" on public.sites for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Builders can archive owned sites" on public.sites for delete using (owner_id = auth.uid());

create policy "Members can read site membership" on public.site_members for select using (public.is_site_member(site_id));
create policy "Builders can add members" on public.site_members for insert with check (public.is_site_owner(site_id) and invited_by = auth.uid());
create policy "Builders can remove members" on public.site_members for delete using (public.is_site_owner(site_id));

create policy "Builders can manage invitations" on public.invitations for all using (public.is_site_owner(site_id)) with check (public.is_site_owner(site_id) and invited_by = auth.uid());

create policy "Members can read categories" on public.categories for select using (site_id is not null and public.is_site_member(site_id));
create policy "Builders can create categories" on public.categories for insert with check (public.is_site_owner(site_id) and created_by = auth.uid());
create policy "Builders can update categories" on public.categories for update using (public.is_site_owner(site_id)) with check (public.is_site_owner(site_id));

create policy "Members can read ledger" on public.ledger_entries for select using (public.is_site_member(site_id));
create policy "Members can add ledger" on public.ledger_entries for insert with check (public.is_site_member(site_id) and created_by = auth.uid());
create policy "Builders can update ledger" on public.ledger_entries for update using (public.is_site_owner(site_id)) with check (public.is_site_owner(site_id));
create policy "Builders can delete ledger" on public.ledger_entries for delete using (public.is_site_owner(site_id));

create policy "Members can read notes" on public.notes for select using (public.is_site_member(site_id));
create policy "Members can add notes" on public.notes for insert with check (public.is_site_member(site_id) and created_by = auth.uid());
create policy "Authors and builders can update notes" on public.notes for update using (created_by = auth.uid() or public.is_site_owner(site_id)) with check (created_by = auth.uid() or public.is_site_owner(site_id));

create policy "Members can read attachments" on public.attachments for select using (public.is_site_member(site_id));
create policy "Members can add attachments" on public.attachments for insert with check (public.is_site_member(site_id) and uploaded_by = auth.uid());

create policy "Only builders can read audit logs" on public.audit_logs for select using (public.is_site_owner(site_id));
-- Inserts are intentionally server-side through FastAPI's service-role client.
-- No update or delete policy is created: audit history is append-only.

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
