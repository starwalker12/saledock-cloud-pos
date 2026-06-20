-- Migration: group get_sales_by_day by the shop's Asia/Karachi business date
--
-- Companion to the Node-side timezone fix (PR #261). That PR makes every
-- server-side business-day boundary explicit Asia/Karachi, but the per-day
-- grouping label inside this RPC was still computed in the Postgres SESSION
-- timezone (Supabase default UTC):
--
--   TO_CHAR(vi.invoice_date, 'YYYY-MM-DD')
--
-- Because invoice_date is timestamptz, TO_CHAR renders it in the session zone,
-- so a sale at 2026-06-20 00:30 PKT (= 2026-06-19 19:30 UTC) was labelled
-- '2026-06-19' and bucketed under the previous day on the dashboard
-- "Sales by Day of Week" widget.
--
-- Fix: convert the timestamptz to the Karachi wall-clock BEFORE formatting,
-- using the explicit IANA zone. `timestamptz AT TIME ZONE 'Asia/Karachi'`
-- returns a `timestamp without time zone` holding the local Karachi time and is
-- deterministic regardless of the session timezone. The outer query already
-- GROUPs and ORDERs BY this `day` label, so changing the expression fixes both
-- the grouping and the label.
--
-- This is the ONLY change. Function name, parameters, return columns, filters,
-- per-invoice gross/net formulas, ordering, SECURITY INVOKER, and grants are
-- preserved exactly. CREATE OR REPLACE keeps existing grants; they are
-- re-asserted below to keep the security posture self-contained and idempotent.

CREATE OR REPLACE FUNCTION get_sales_by_day(
  p_org_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  date TEXT,
  count BIGINT,
  gross NUMERIC,
  net NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH valid_invoices AS (
    SELECT
      vi.id,
      -- Asia/Karachi calendar date of the sale (session-timezone independent).
      TO_CHAR(vi.invoice_date AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS day,
      vi.discount_total,
      COALESCE(
        SUM(
          CASE
            WHEN ii.product_type = 'product' THEN ii.line_total
            WHEN ii.product_type = 'service' THEN
              CASE WHEN COALESCE(ii.service_commission, 0) > 0 THEN ii.service_commission ELSE ii.line_total END
            ELSE 0
          END
        ), 0
      ) AS inv_gross
    FROM invoices vi
    LEFT JOIN invoice_items ii ON ii.invoice_id = vi.id
    WHERE vi.organization_id = p_org_id
      AND vi.status != 'void'
      AND vi.invoice_date >= p_start_date
      AND vi.invoice_date <= p_end_date
      AND (p_branch_id IS NULL OR vi.branch_id = p_branch_id)
    GROUP BY vi.id, vi.invoice_date, vi.discount_total
  )
  SELECT
    day AS date,
    COUNT(*)::BIGINT AS count,
    SUM(inv_gross)::NUMERIC AS gross,
    SUM(GREATEST(inv_gross - COALESCE(discount_total, 0), 0))::NUMERIC AS net
  FROM valid_invoices
  GROUP BY day
  ORDER BY day ASC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Preserve the original access posture (idempotent re-assert).
REVOKE ALL ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
