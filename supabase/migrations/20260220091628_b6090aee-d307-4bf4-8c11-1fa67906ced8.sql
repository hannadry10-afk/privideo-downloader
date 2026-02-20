
CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Video',
  description TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  video_url TEXT NOT NULL,
  source_url TEXT DEFAULT '',
  format TEXT DEFAULT 'mp4',
  quality TEXT DEFAULT '',
  size TEXT DEFAULT '',
  author TEXT DEFAULT '',
  date_uploaded TEXT DEFAULT '',
  site_name TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Public read access (like YouTube - anyone can view)
CREATE POLICY "Videos are publicly viewable"
  ON public.videos FOR SELECT
  USING (true);

-- Public insert (no auth required for this app)
CREATE POLICY "Anyone can upload videos"
  ON public.videos FOR INSERT
  WITH CHECK (true);

-- Public delete
CREATE POLICY "Anyone can delete videos"
  ON public.videos FOR DELETE
  USING (true);
