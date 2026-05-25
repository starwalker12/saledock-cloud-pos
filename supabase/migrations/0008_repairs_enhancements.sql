-- Additive columns for repairs table: accessories_received and payment_method
alter table public.repairs add column if not exists accessories_received text;
alter table public.repairs add column if not exists payment_method public.payment_method not null default 'cash';
