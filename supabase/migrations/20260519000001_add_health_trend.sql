-- Add health_trend column to clients and create function to calculate it
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS health_trend integer DEFAULT 0;

-- Calculates month-over-month trend for all active clients
-- trend = current health_total - most recent prior month snapshot in health_score_history
CREATE OR REPLACE FUNCTION public.calculate_health_trends()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  updated_count integer;
  current_month text;
BEGIN
  current_month := to_char(now(), 'YYYY-MM');

  UPDATE public.clients c
  SET health_trend = c.health_total - COALESCE(
    (
      SELECT h.health_total
      FROM public.health_score_history h
      WHERE h.client_id = c.id
        AND h.ref_month < current_month
      ORDER BY h.ref_month DESC
      LIMIT 1
    ),
    c.health_total
  )
  WHERE c.contract_active = true;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
