import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Download, Film, Globe, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { VideoResult } from '@/lib/api/video';

interface ScoredSource {
  url: string;
  quality?: string;
  score: number;
  label: string;
  badge: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
}

const qualityScore = (q: string): number => {
  const lower = q.toLowerCase();
  const resMatch = lower.match(/(\d{3,4})\s*p/);
  if (resMatch) return parseInt(resMatch[1], 10);
  if (lower.includes('4k') || lower.includes('2160')) return 2160;
  if (lower.includes('1080')) return 1080;
  if (lower.includes('720') || lower === 'hd' || lower.includes('hd+') || lower.includes('hd (no watermark)')) return 720;
  if (lower.includes('480') || lower === 'sd') return 480;
  if (lower.includes('360')) return 360;
  if (lower.includes('240')) return 240;
  if (lower.includes('high') || lower.includes('best')) return 720;
  return 300;
};

const qualityBadge = (score: number): { badge: string; variant: 'default' | 'secondary' | 'outline' } => {
  if (score >= 2160) return { badge: '4K Ultra HD', variant: 'default' };
  if (score >= 1080) return { badge: '1080p HD', variant: 'default' };
  if (score >= 720) return { badge: '720p HD', variant: 'secondary' };
  if (score >= 480) return { badge: '480p SD', variant: 'outline' };
  if (score >= 360) return { badge: '360p', variant: 'outline' };
  return { badge: 'SD', variant: 'outline' };
};

const WatchPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result as VideoResult | undefined;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!result || !result.success) {
      navigate('/', { replace: true });
    }
  }, [result, navigate]);

  if (!result || !result.success) return null;

  const metadata = result.metadata;

  // Build all available download options, sorted by quality
  const getAllDownloads = (): ScoredSource[] => {
    const sources: ScoredSource[] = [];
    const seenUrls = new Set<string>();

    const addItems = (items: { url: string; quality?: string }[]) => {
      for (const item of items) {
        if (!item.url || seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        const score = qualityScore(item.quality || '');
        const { badge, variant } = qualityBadge(score);
        sources.push({
          url: item.url,
          quality: item.quality,
          score,
          label: item.quality || 'Video',
          badge,
          badgeVariant: variant,
        });
      }
    };

    if (result.type === 'direct' && result.url && !seenUrls.has(result.url)) {
      seenUrls.add(result.url);
      const score = metadata?.resolution ? qualityScore(metadata.resolution) : 720;
      const { badge, variant } = qualityBadge(score);
      sources.push({ url: result.url, quality: metadata?.resolution, score, label: result.filename || 'Video', badge, badgeVariant: variant });
    }

    if (result.picker?.length) addItems(result.picker);
    if (result.videoSources?.length) addItems(result.videoSources);

    if (sources.length === 0 && metadata?.videoUrl) {
      const { badge, variant } = qualityBadge(300);
      sources.push({ url: metadata.videoUrl, score: 300, label: 'Video', badge, badgeVariant: variant });
    }

    return sources.sort((a, b) => b.score - a.score);
  };

  const allDownloads = getAllDownloads();
  const best = allDownloads[0] || null;
  const others = allDownloads.slice(1);

  const forceDownload = async (url: string, label?: string) => {
    // Try blob download for cross-origin files
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${(metadata?.title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')}_${label || 'video'}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch {
      // Blob download failed (CORS), fall back to open in new tab
    }
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
              <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 flex items-center gap-1.5">
                {metadata.siteName && (
                  <span className="glass rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-medium flex items-center gap-1">
                    <Globe className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary" />
                    {metadata.siteName}
                  </span>
                )}
                {best && (
                  <Badge variant={best.badgeVariant} className="text-[10px] md:text-xs px-1.5 py-0.5">
                    {best.badge}
                  </Badge>
                )}
              </div>
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

          {/* Best download button */}
          {best ? (
            <div className="space-y-2">
              <Button
                onClick={() => forceDownload(best.url, best.badge)}
                className="w-full h-12 md:h-14 rounded-xl md:rounded-2xl bg-primary text-primary-foreground font-semibold text-sm md:text-base gap-2"
              >
                <Download className="h-5 w-5" />
                Download {best.badge}
              </Button>

              {/* Other quality options */}
              {others.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    {showAll ? 'Hide' : 'Show'} {others.length} more quality option{others.length > 1 ? 's' : ''}
                    {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  {showAll && (
                    <div className="glass rounded-xl md:rounded-2xl p-2 md:p-3 space-y-1.5">
                      {others.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => forceDownload(src.url)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                            <span className="text-xs md:text-sm truncate">{src.label}</span>
                          </div>
                          <Badge variant={src.badgeVariant} className="text-[10px] shrink-0">
                            {src.badge}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
