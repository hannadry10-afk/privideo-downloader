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

      <div className="relative z-10 px-3 md:px-4 py-4 md:py-12 max-w-4xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-4 md:mb-6 text-muted-foreground hover:text-foreground gap-2 h-8 md:h-10 text-xs md:text-sm px-2 md:px-4"
        >
          <ArrowLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-6">
          {/* Video Preview */}
          <div className="lg:col-span-3 space-y-3 md:space-y-4">
            {metadata?.thumbnail && (
              <div className="relative aspect-video bg-secondary rounded-xl md:rounded-2xl overflow-hidden glass">
                <img
                  src={metadata.thumbnail}
                  alt={metadata.title || 'Video thumbnail'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                <div className="absolute bottom-2 md:bottom-3 left-2 md:left-3 right-2 md:right-3 flex items-end justify-between gap-2">
                  {metadata.siteName && (
                    <span className="glass rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-medium flex items-center gap-1 shrink-0">
                      <Globe className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary" />
                      {metadata.siteName}
                    </span>
                  )}
                  <div className="flex gap-1 md:gap-1.5 shrink-0">
                    {metadata.duration && (
                      <span className="glass rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-mono flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        {metadata.duration}s
                      </span>
                    )}
                    {metadata.resolution && (
                      <span className="glass rounded-lg px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] md:text-xs font-mono flex items-center gap-1">
                        <Monitor className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        {metadata.resolution}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Video info */}
            <div className="glass rounded-xl md:rounded-2xl p-3 md:p-6 space-y-2 md:space-y-3">
              {metadata && (
                <>
                  <div className="flex items-start gap-2 md:gap-3">
                    <Film className="h-4 w-4 md:h-5 md:w-5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h1 className="font-semibold text-sm md:text-lg leading-tight line-clamp-2 break-words">
                        {metadata.title}
                      </h1>
                      {metadata.author && (
                        <p className="text-muted-foreground text-xs md:text-sm mt-1 flex items-center gap-1.5 truncate">
                          <User className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" />
                          <span className="truncate">{metadata.author}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {metadata.description && (
                    <p className="text-muted-foreground text-xs md:text-sm line-clamp-3 md:line-clamp-4 break-words">
                      {metadata.description}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Download options */}
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            <div className="glass rounded-xl md:rounded-2xl p-3 md:p-6 space-y-3 md:space-y-4">
              <h2 className="font-semibold text-sm md:text-base flex items-center gap-2">
                <Download className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                Download Options
              </h2>

              {isFallbackOnly && (
                <div className="rounded-lg md:rounded-xl bg-secondary/50 border border-border p-2 md:p-3 text-[10px] md:text-xs text-muted-foreground">
                  Raw stream links found. Some hosts may block direct download.
                </div>
              )}

              {allSources.length > 0 ? (
                <>
                  <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1.5">
                    <FileVideo className="h-3 w-3 md:h-3.5 md:w-3.5" />
                    {allSources.length} option{allSources.length > 1 ? 's' : ''} available
                  </p>
                  <div className="grid gap-1.5 md:gap-2 max-h-[50vh] overflow-y-auto pr-1">
                    {allSources.map((source, i) => (
                      <Button
                        key={i}
                        variant={i === 0 ? 'default' : 'secondary'}
                        onClick={() => forceDownload(source.url)}
                        className={`w-full justify-between h-9 md:h-11 rounded-lg md:rounded-xl text-xs md:text-sm ${i === 0 ? 'bg-primary text-primary-foreground font-semibold' : ''}`}
                      >
                        <span className="flex items-center gap-1.5 md:gap-2 truncate min-w-0">
                          {source.isAudio ? <Music className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" /> : <Download className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />}
                          <span className="truncate">{isFallbackOnly ? `Open / ${source.label}` : source.label}</span>
                        </span>
                        <ExternalLink className="h-3 w-3 md:h-3.5 md:w-3.5 opacity-60 shrink-0 ml-1" />
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-lg md:rounded-xl bg-secondary/50 border border-border p-3 md:p-4 text-xs md:text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <HardDrive className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    No direct download links found — DRM or authentication may be required.
                  </p>
                  {metadata?.videoUrl && (
                    <Button
                      variant="secondary"
                      className="mt-2 md:mt-3 w-full rounded-lg md:rounded-xl h-9 md:h-10 text-xs md:text-sm"
                      onClick={() => forceDownload(metadata.videoUrl!)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 md:h-4 md:w-4 mr-2" />
                      Try OG Video URL
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full rounded-lg md:rounded-xl h-9 md:h-11 text-xs md:text-sm"
              onClick={() => navigate('/')}
            >
              Fetch Another Video
            </Button>
          </div>
        </div>

        <footer className="mt-8 md:mt-12 text-center text-[10px] md:text-xs text-muted-foreground">
          © 2026 Incognito Zone. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default WatchPage;
