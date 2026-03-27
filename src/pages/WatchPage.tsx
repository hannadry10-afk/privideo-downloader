import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Download, ExternalLink, Film, Clock, Globe, User, Monitor, HardDrive, FileVideo, ArrowLeft, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoResult, VideoSource } from '@/lib/api/video';

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

  const forceDownload = (url: string, filename?: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderSourceLabel = (item: { quality?: string; format?: string; size?: string }, i: number) => {
    const parts: string[] = [];
    if (item.quality) parts.push(item.quality);
    if (item.format) parts.push(item.format.toUpperCase());
    if (item.size) parts.push(item.size);
    return parts.length > 0 ? parts.join(' · ') : `Video ${i + 1}`;
  };

  const allSources: { url: string; label: string; isAudio?: boolean }[] = [];

  if (result.type === 'direct' && result.url) {
    allSources.push({ url: result.url, label: result.filename || 'Download Video' });
  }

  if (result.picker) {
    result.picker.forEach((item, i) => {
      allSources.push({ url: item.url, label: renderSourceLabel(item, i) });
    });
  }

  if (result.audio) {
    allSources.push({ url: result.audio, label: 'Audio Only (MP3)', isAudio: true });
  }

  if (result.videoSources) {
    const existingUrls = new Set(allSources.map(s => s.url));
    result.videoSources.forEach((src, i) => {
      if (!existingUrls.has(src.url)) {
        allSources.push({ url: src.url, label: renderSourceLabel(src, i) });
      }
    });
  }

  const isFallbackOnly = result.type === 'metadata_only' && allSources.length > 0;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="relative z-10 px-4 py-6 md:py-12 max-w-4xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-muted-foreground hover:text-foreground gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Video Preview - left/top */}
          <div className="lg:col-span-3 space-y-4">
            {metadata?.thumbnail && (
              <div className="relative aspect-video bg-secondary rounded-2xl overflow-hidden glass">
                <img
                  src={metadata.thumbnail}
                  alt={metadata.title || 'Video thumbnail'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                  {metadata.siteName && (
                    <span className="glass rounded-lg px-2.5 py-1 text-xs font-medium flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-primary" />
                      {metadata.siteName}
                    </span>
                  )}
                  <div className="flex gap-1.5">
                    {metadata.duration && (
                      <span className="glass rounded-lg px-2.5 py-1 text-xs font-mono flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {metadata.duration}s
                      </span>
                    )}
                    {metadata.resolution && (
                      <span className="glass rounded-lg px-2.5 py-1 text-xs font-mono flex items-center gap-1.5">
                        <Monitor className="h-3 w-3" />
                        {metadata.resolution}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Video info */}
            <div className="glass rounded-2xl p-4 md:p-6 space-y-3">
              {metadata && (
                <>
                  <div className="flex items-start gap-3">
                    <Film className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <h1 className="font-semibold text-base md:text-lg leading-tight line-clamp-2">
                        {metadata.title}
                      </h1>
                      {metadata.author && (
                        <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {metadata.author}
                        </p>
                      )}
                    </div>
                  </div>
                  {metadata.description && (
                    <p className="text-muted-foreground text-sm line-clamp-4">
                      {metadata.description}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Download options - right/bottom */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass rounded-2xl p-4 md:p-6 space-y-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Download Options
              </h2>

              {isFallbackOnly && (
                <div className="rounded-xl bg-secondary/50 border border-border p-3 text-xs text-muted-foreground">
                  Raw stream links found. Some hosts may block direct download, but opening in a new tab can still play.
                </div>
              )}

              {allSources.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileVideo className="h-3.5 w-3.5" />
                    {allSources.length} option{allSources.length > 1 ? 's' : ''} available
                  </p>
                  <div className="grid gap-2">
                    {allSources.map((source, i) => (
                      <Button
                        key={i}
                        variant={i === 0 ? 'default' : 'secondary'}
                        onClick={() => forceDownload(source.url)}
                        className={`w-full justify-between h-11 rounded-xl text-sm ${i === 0 ? 'bg-primary text-primary-foreground font-semibold' : ''}`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {source.isAudio ? <Music className="h-4 w-4 shrink-0" /> : <Download className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{isFallbackOnly ? `Open / ${source.label}` : source.label}</span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-60 shrink-0" />
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-secondary/50 border border-border p-4 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    No direct download links found — DRM or authentication may be required.
                  </p>
                  {metadata?.videoUrl && (
                    <Button
                      variant="secondary"
                      className="mt-3 w-full rounded-xl"
                      onClick={() => forceDownload(metadata.videoUrl!)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Try OG Video URL
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Fetch another */}
            <Button
              variant="outline"
              className="w-full rounded-xl h-11"
              onClick={() => navigate('/')}
            >
              Fetch Another Video
            </Button>
          </div>
        </div>

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          © 2026 Incognito Zone. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default WatchPage;
