import { Download, Film, Clock, Globe, User, Calendar, FileVideo, ExternalLink, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScannedVideo } from '@/lib/api/video';

interface VideoGridProps {
  videos: ScannedVideo[];
  siteName?: string;
  scannedUrl?: string;
}

const VideoGrid = ({ videos, siteName, scannedUrl }: VideoGridProps) => {
  const forceDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    videos.forEach((video, i) => {
      setTimeout(() => forceDownload(video.url), i * 500);
    });
  };

  if (videos.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="glass rounded-2xl p-8 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Videos Found</h3>
          <p className="text-sm text-muted-foreground">
            No downloadable videos were detected on this page. The site may use DRM or load content dynamically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileVideo className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base sm:text-lg">
              {videos.length} Video{videos.length !== 1 ? 's' : ''} Found
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {siteName && <span className="flex items-center gap-1"><Globe className="h-3 w-3 inline" /> {siteName}</span>}
            </p>
          </div>
        </div>
        <Button
          onClick={downloadAll}
          className="w-full sm:w-auto rounded-xl bg-primary text-primary-foreground font-semibold h-11"
        >
          <Download className="h-4 w-4 mr-2" />
          Download All ({videos.length})
        </Button>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="glass rounded-2xl overflow-hidden hover:border-primary/30 transition-colors group"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-secondary overflow-hidden">
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Badges */}
              <div className="absolute top-2 right-2 flex gap-1.5">
                {video.format && (
                  <span className="glass rounded-md px-2 py-0.5 text-[10px] font-mono uppercase">
                    {video.format}
                  </span>
                )}
                {video.size && (
                  <span className="glass rounded-md px-2 py-0.5 text-[10px] font-mono">
                    {video.size}
                  </span>
                )}
              </div>

              {video.duration && (
                <span className="absolute bottom-2 right-2 glass rounded-md px-2 py-0.5 text-[10px] font-mono flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {video.duration}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="p-3 sm:p-4 space-y-2">
              <h4 className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
                {video.title || 'Untitled Video'}
              </h4>

              {video.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {video.description}
                </p>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {video.author && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {video.author}
                  </span>
                )}
                {video.dateUploaded && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(video.dateUploaded)}
                  </span>
                )}
                {video.quality && (
                  <span className="flex items-center gap-1">
                    {video.quality}
                  </span>
                )}
              </div>

              <Button
                onClick={() => forceDownload(video.url)}
                variant="secondary"
                className="w-full h-9 rounded-xl text-xs font-medium mt-1"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
                <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default VideoGrid;
