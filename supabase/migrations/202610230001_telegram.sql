-- Telegram bot: users link a Telegram chat to their account, then send UPI
-- screenshots that become site expenses. Both tables are only touched by the
-- API's service-role client, so RLS is on with no policies.

create table public.telegram_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint unique,
  telegram_username text,
  link_code text unique,
  code_expires_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per screenshot while the bot asks for the amount and the site.
create table public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id bigint not null,
  -- Telegram re-sends a webhook it thinks failed; the unique id makes that a no-op.
  update_id bigint not null unique,
  -- Telegram keeps the file; it is copied into receipts storage once saved.
  file_id text not null,
  mime_type text,
  amount numeric(14, 2) check (amount is null or amount > 0),
  entry_date date not null,
  date_source text not null check (date_source in ('screenshot', 'message')),
  paid_to text,
  reference text,
  payment_method text,
  ocr_text text,
  state text not null default 'reading' check (state in ('reading', 'awaiting_amount', 'awaiting_site', 'done', 'cancelled')),
  -- The bot message whose buttons act on this draft (callback data is too
  -- small to carry ids, so buttons are matched back through this).
  prompt_message_id bigint,
  site_id uuid references public.sites(id) on delete set null,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index telegram_drafts_prompt_idx on public.telegram_drafts(chat_id, prompt_message_id);
create index telegram_drafts_chat_open_idx on public.telegram_drafts(chat_id, created_at desc) where state in ('awaiting_amount', 'awaiting_site');

alter table public.telegram_links enable row level security;
alter table public.telegram_drafts enable row level security;
