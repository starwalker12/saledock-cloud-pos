-- Daily Closing UI needs a precise close timestamp ("Closed at …").
-- The existing daily_closings table from migration 0001 already has finalized_by
-- but no finalized_at; this migration adds it. RLS and the existing unique
-- (organization_id, branch_id, closing_date) constraint are unchanged.

alter table public.daily_closings
  add column if not exists finalized_at timestamptz;
