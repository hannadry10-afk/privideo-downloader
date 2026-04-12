
-- Add unique constraint on url for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_visits_url_key'
  ) THEN
    ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_url_key UNIQUE (url);
  END IF;
END $$;

-- Create upsert function for site visits
CREATE OR REPLACE FUNCTION public.upsert_site_visit(p_site_name text, p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
BEGIN
  v_domain := regexp_replace(p_url, '^(https?://[^/]+).*$', '\1');
  
  INSERT INTO public.site_visits (site_name, url, visit_count, last_visited_at)
  VALUES (p_site_name, v_domain, 1, now())
  ON CONFLICT (url) DO UPDATE
  SET visit_count = site_visits.visit_count + 1,
      last_visited_at = now(),
      site_name = COALESCE(NULLIF(p_site_name, ''), site_visits.site_name);
END;
$$;

-- Allow public read access (drop if exists first)
DROP POLICY IF EXISTS "Anyone can view site visits" ON public.site_visits;
CREATE POLICY "Anyone can view site visits"
ON public.site_visits
FOR SELECT
USING (true);
