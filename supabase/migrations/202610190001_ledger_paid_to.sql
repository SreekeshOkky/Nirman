-- Who a payment went to (or, for money received, who it came from). Kept
-- separate from the free-text description so it can be searched, suggested
-- and exported on its own.
alter table public.ledger_entries
  add column paid_to text check (paid_to is null or char_length(paid_to) <= 120);
