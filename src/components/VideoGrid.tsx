import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Film, Clock, Globe, User, Calendar, FileVideo, ExternalLink, HardDrive, Upload, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ScannedVideo } from '@/lib/api/video';

interface VideoGridProps {
  videos: ScannedVideo[];
  siteName?: string;
  scannedUrl?: string;
}

const VideoGrid = ({ videos, siteName, scannedUrl }: VideoGridProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const uploadAll = async () => {
    setUploading(true);
    try {
      const rows = videos.map(v => ({
        title: v.title || 'Untitled Video',
        description: v.description || '',
        thumbnail: v.thumbnail || '',
        duration: v.duration || '',
        video_url: v.url,
        source_url: v.sourceUrl || v.url,
        format: v.format || 'mp4',
        quality: v.quality || '',
        size: v.size || '',
        author: v.author || '',
        date_uploaded: v.dateUploaded || '',
        site_name: v.siteName || siteName || '',
      }));

      const { error } = await supabase.from('videos').insert(rows);

      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      } else {
        setUploaded(true);
        toast({ title: 'Uploaded!', description: `${videos.length} video(s) added to your library.` });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
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
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileVideo className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base sm:text-lg">
                {videos.length} Video{videos.length !== 1 ? 's' : ''} Found
              </h3>
              {siteName && (
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {siteName}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {uploaded ? (
              <Button
                onClick={() => navigate('/videos')}
                className="rounded-xl h-10 px-5 font-medium bg-accent text-accent-foreground w-full sm:w-auto"
              >
                <Check className="h-4 w-4 mr-2" />
                View My Videos
              </Button>
            ) : (
              <Button
                onClick={uploadAll}
                disabled={uploading}
                className="rounded-xl h-10 px-5 font-medium bg-primary text-primary-foreground w-full sm:w-auto"
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? 'Uploading...' : `Upload All (${videos.length})`}
              </Button>
            )}
            <Button
              onClick={downloadAll}
              variant="secondary"
              className="rounded-xl h-10 px-5 font-medium w-full sm:w-auto"
            >
              <Download className="h-4 w-4 mr-2" />
              Download All
            </Button>
          </div>
        </div>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="glass rounded-2xl overflow-hidden hover:border-primary/30 transition-colors group"
          >
            <div className="relative aspect-video bg-secondary overflow-hidden">
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}

              <div className="absolute top-2 right-2 flex gap-1">
                {video.format && (
                  <span className="glass rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase">{video.format}</span>
                )}
                {video.size && (
                  <span className="glass rounded-md px-1.5 py-0.5 text-[10px] font-mono">{video.size}</span>
                )}
              </div>

              {video.duration && (
                <span className="absolute bottom-2 right-2 glass rounded-md px-1.5 py-0.5 text-[10px] font-mono flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />{video.duration}
                </span>
              )}
            </div>

            <div className="p-3 space-y-1.5">
              <h4 className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.25rem]">
                {video.title || 'Untitled Video'}
              </h4>

              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                {video.author && (
                  <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{video.author}</span>
                )}
                {video.dateUploaded && (
                  <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{formatDate(video.dateUploaded)}</span>
                )}
              </div>

              <Button
                onClick={() => forceDownload(video.url)}
                variant="secondary"
                className="w-full h-8 rounded-lg text-[11px] font-medium mt-1"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
                <ExternalLink className="h-2.5 w-2.5 ml-auto opacity-50" />
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
  } catch { return dateStr; }
}

export default VideoGrid;
