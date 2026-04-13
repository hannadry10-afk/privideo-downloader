import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Download, Film, Globe, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoResult } from '@/lib/api/video';

const WatchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result as VideoResult | undefined;

  useEffect(() => {
    if (!result || !result.success) {
      navigate('/', { replace: true });
    }
  }, [result, navigate]);

  if (!result || !result.success) return null;

  const metadata = result.metadata;

  // Get the best (highest quality) download URL
  const getBestDownload = () => {
    // Helper to pick highest quality from a list
    const pickBest = (items: { url: string; quality?: string }[]) => {
      if (!items || items.length === 0) return null;
      const scored = items
        .filter(i => i.url)
        .map(i => {
          const q = (i.quality || '').toLowerCase();
          let score = 0;
          const resMatch = q.match(/(\d{3,4})\s*p/);
          if (resMatch) score = parseInt(resMatch[1], 10);
          else if (q.includes('4k') || q.includes('2160')) score = 2160;
          else if (q.includes('1080')) score = 1080;
          else if (q.includes('720') || q === 'hd' || q.includes('hd+') || q.includes('hd (no watermark)')) score = 720;
          else if (q.includes('480') || q === 'sd') score = 480;
          else if (q.includes('high') || q.includes('best')) score = 720;
          else score = 300;
          return { ...i, score };
        })
        .sort((a, b) => b.score - a.score);
      return scored[0] || null;
    };

    if (result.type === 'direct' && result.url) {
      return { url: result.url, label: result.filename || 'Download Video' };
    }
    if (result.picker && result.picker.length > 0) {
      const best = pickBest(result.picker);
      if (best) return { url: best.url, label: best.quality ? `Download ${best.quality}` : 'Download Video' };
    }
    if (result.videoSources && result.videoSources.length > 0) {
      const best = pickBest(result.videoSources);
      if (best) return { url: best.url, label: best.quality ? `Download ${best.quality}` : 'Download Video' };
    }
    if (metadata?.videoUrl) {
      return { url: metadata.videoUrl, label: 'Download Video' };
    }
    return null;
  };

  const best = getBestDownload();

  const forceDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="relative z-10 px-3 md:px-4 py-4 md:py-12 max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-4 md:mb-6 text-muted-foreground hover:text-foreground gap-2 h-8 md:h-10 text-xs md:text-sm px-2 md:px-4"
        >
          <ArrowLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Back
        </Button>

        <div className="space-y-4 md:space-y-6">
          {/* Thumbnail */}
          {metadata?.thumbnail && (
            <div className="relative aspect-video bg-secondary rounded-xl md:rounded-2xl overflow-hidden glass">
              <img
                src={metadata.thumbnail}
                alt={metadata.title || 'Video thumbnail'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/60 to-transparent" />
              {metadata.siteName && (
                <span className="absolute bottom-2 left-2 md:bottom-3 md:left-3 glass rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-medium flex items-center gap-1">
                  <Globe className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary" />
                  {metadata.siteName}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          {metadata && (
            <div className="glass rounded-xl md:rounded-2xl p-3 md:p-5 space-y-1.5">
              <div className="flex items-start gap-2">
                <Film className="h-4 w-4 md:h-5 md:w-5 text-primary mt-0.5 shrink-0" />
                <h1 className="font-semibold text-sm md:text-lg leading-tight line-clamp-2 break-words">
                  {metadata.title}
                </h1>
              </div>
              {metadata.author && (
                <p className="text-muted-foreground text-xs md:text-sm pl-6 truncate">{metadata.author}</p>
              )}
            </div>
          )}

          {/* Download button */}
          {best ? (
            <Button
              onClick={() => forceDownload(best.url)}
              className="w-full h-12 md:h-14 rounded-xl md:rounded-2xl bg-primary text-primary-foreground font-semibold text-sm md:text-base gap-2"
            >
              <Download className="h-5 w-5" />
              {best.label}
            </Button>
          ) : (
            <div className="glass rounded-xl md:rounded-2xl p-4 text-center text-sm text-muted-foreground">
              No download links found — DRM or authentication may be required.
            </div>
          )}

          <Button
            variant="outline"
            className="w-full rounded-xl md:rounded-2xl h-10 md:h-12 text-xs md:text-sm"
            onClick={() => navigate('/')}
          >
            Fetch Another Video
          </Button>
        </div>

        <footer className="mt-8 md:mt-12 text-center text-[10px] md:text-xs text-muted-foreground">
          © 2026 Incognito Zone. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default WatchPage;
