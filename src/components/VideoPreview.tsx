import { Download, ExternalLink, Film, Clock, Globe, User, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoResult } from '@/lib/api/video';

interface VideoPreviewProps {
  result: VideoResult;
}

const VideoPreview = ({ result }: VideoPreviewProps) => {
  const metadata = result.metadata;

  const handleDownload = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="glass rounded-2xl overflow-hidden">
        {/* Thumbnail */}
        {metadata?.thumbnail && (
          <div className="relative aspect-video bg-secondary overflow-hidden">
            <img
              src={metadata.thumbnail}
              alt={metadata.title || 'Video thumbnail'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              {metadata.siteName && (
                <span className="glass rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
                  <Globe className="h-3 w-3 text-primary" />
                  {metadata.siteName}
                </span>
              )}
              <div className="flex gap-2">
                {metadata.duration && (
                  <span className="glass rounded-lg px-3 py-1.5 text-xs font-mono flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {metadata.duration}s
                  </span>
                )}
                {metadata.resolution && (
                  <span className="glass rounded-lg px-3 py-1.5 text-xs font-mono flex items-center gap-1.5">
                    <Monitor className="h-3 w-3" />
                    {metadata.resolution}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="p-6 space-y-4">
          {metadata && (
            <>
              <div className="flex items-start gap-3">
                <Film className="h-5 w-5 text-primary mt-1 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg leading-tight line-clamp-2">
                    {metadata.title}
                  </h3>
                  {metadata.author && (
                    <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {metadata.author}
                    </p>
                  )}
                </div>
              </div>

              {metadata.description && (
                <p className="text-muted-foreground text-sm line-clamp-3">
                  {metadata.description}
                </p>
              )}

              {/* Metadata badges */}
              <div className="flex flex-wrap gap-2">
                {metadata.type && (
                  <span className="rounded-lg bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                    {metadata.type}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Download options */}
          {result.success && result.type === 'direct' && result.url && (
            <Button
              onClick={() => handleDownload(result.url!)}
              className="w-full h-12 bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 rounded-xl"
            >
              <Download className="h-5 w-5 mr-2" />
              Download {result.filename ? `— ${result.filename}` : 'Video'}
            </Button>
          )}

          {result.success && result.type === 'picker' && result.picker && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Available downloads:</p>
              <div className="grid gap-2">
                {result.picker.map((item, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    onClick={() => handleDownload(item.url)}
                    className="w-full justify-between h-11 rounded-xl"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      {item.type === 'video' ? 'Video' : 'Photo'} {i + 1}
                    </span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ))}
                {result.audio && (
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload(result.audio!)}
                    className="w-full justify-between h-11 rounded-xl"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Audio Only
                    </span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {result.success && result.type === 'metadata_only' && (
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-sm text-muted-foreground">
              ℹ️ Video metadata fetched successfully. Direct download may not be available for this platform — try right-clicking the video on the original page.
            </div>
          )}

          {!result.success && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
              {result.error || 'Could not process this video. The platform may not be supported.'}
              {metadata && metadata.title !== 'Unknown' && (
                <p className="mt-2 text-muted-foreground">However, we were able to retrieve the video metadata above.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
