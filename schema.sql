-- =====================================================
-- VOLT — Store database schema for Supabase
-- Paste this whole file into: Supabase → SQL Editor → New query → Run
-- =====================================================

-- Store settings (one row per store owner)
create table settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null unique,
  store_name text not null default 'MY STORE',
  currency text not null default 'USD',
  opening_cash numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Products / inventory
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  barcode text not null,
  name text not null,
  brand text default '',
  category text default '',
  cost numeric not null default 0,
  price numeric not null default 0,
  qty integer not null default 0,
  alert_at integer not null default 2,
  supplier text default '',
  created_at timestamptz not null default now(),
  unique (user_id, barcode)
);

-- Income & expenses (sales land here automatically)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  type text not null check (type in ('income', 'expense')),
  reason text not null,
  amount numeric not null check (amount > 0),
  profit numeric,                          -- filled for auto sale entries
  auto boolean not null default false,     -- true = created by a sale
  product_id uuid references products(id), -- link back to the product sold
  created_at timestamptz not null default now()
);

-- Debts: money you owe and money owed to you
create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  direction text not null check (direction in ('owe', 'owed')),
  name text not null,
  amount numeric not null check (amount > 0),
  due text default '',
  created_at timestamptz not null default now()
);

-- Stock adjustments (damaged / lost / stolen / returned) — the audit trail
create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  product_id uuid references products(id) not null,
  qty_removed integer not null check (qty_removed > 0),
  reason text not null,
  value_written_off numeric not null default 0,
  created_at timestamptz not null default now()
);

-- =====================================================
-- SECURITY: each owner can only ever see their own data.
-- This is the real version of the PIN idea.
-- =====================================================
alter table settings enable row level security;
alter table products enable row level security;
alter table transactions enable row level security;
alter table debts enable row level security;
alter table stock_adjustments enable row level security;

create policy "own settings" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own products" on products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own debts" on debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own adjustments" on stock_adjustments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes for speed as data grows
create index idx_products_user on products(user_id);
create index idx_tx_user_time on transactions(user_id, created_at desc);
create index idx_debts_user on debts(user_id);
