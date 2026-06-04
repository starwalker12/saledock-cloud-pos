-- Migration 0035: Sales by day RPC
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
      TO_CHAR(vi.invoice_date, 'YYYY-MM-DD') AS day,
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

-- Limit access
REVOKE ALL ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sales_by_day(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
