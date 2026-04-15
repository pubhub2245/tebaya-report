-- Supabase schema for tebasaya-report
-- Run this in Supabase SQL editor.

create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  location text not null,
  staff_name text not null,
  sales_amount integer not null default 0,
  cumulative_sales integer not null default 0,
  register_total integer not null default 0,
  register_ok boolean not null default true,
  register_diff integer not null default 0,
  remaining_tebasaki integer not null default 0,
  remaining_gyoza integer not null default 0,
  remaining_potato integer not null default 0,
  remaining_tornado integer not null default 0,
  expenses jsonb not null default '[]'::jsonb,
  handover text,
  line_text text
);

create index if not exists daily_reports_date_idx on daily_reports (date desc);

-- Migration for existing installs:
alter table daily_reports
  add column if not exists register_diff integer not null default 0;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references daily_reports(id) on delete cascade,
  description text not null,
  amount integer not null default 0,
  receipt_image_url text
);

-- Storage bucket for receipts (create via Supabase UI or CLI):
--   bucket name: receipts (public read)

-- Enable RLS for production; for now use permissive policy (adjust for auth):
alter table daily_reports enable row level security;
alter table expenses enable row level security;

drop policy if exists "allow all daily_reports" on daily_reports;
create policy "allow all daily_reports" on daily_reports
  for all using (true) with check (true);

drop policy if exists "allow all expenses" on expenses;
create policy "allow all expenses" on expenses
  for all using (true) with check (true);
