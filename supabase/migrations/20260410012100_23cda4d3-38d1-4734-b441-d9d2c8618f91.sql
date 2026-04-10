
CREATE TABLE public.site_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_name TEXT NOT NULL,
  url TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  last_visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_visits_visit_count ON public.site_visits (visit_count DESC);
CREATE INDEX idx_site_visits_last_visited ON public.site_visits (last_visited_at DESC);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site visits are publicly viewable"
ON public.site_visits
FOR SELECT
TO public
USING (true);

CREATE POLICY "Service role can insert site visits"
ON public.site_visits
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update site visits"
ON public.site_visits
FOR UPDATE
TO service_role
USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_visits;
