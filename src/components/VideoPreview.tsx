import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ExternalLink, Film, Clock, Globe, User, Monitor, HardDrive, FileVideo, Upload, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { VideoResult, VideoSource } from '@/lib/api/video';

interface VideoPreviewProps {
  result: VideoResult;
}

const VideoPreview = ({ result }: VideoPreviewProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const handleUpload = async () => {
    if (!result.success || !metadata) return;
    setUploading(true);
    try {
      const videoUrl = allSources[0]?.url || metadata.videoUrl || '';
      const { error } = await supabase.from('videos').insert({
        title: metadata.title || 'Untitled Video',
        description: metadata.description || '',
        thumbnail: metadata.thumbnail || '',
        duration: metadata.duration || '',
        video_url: videoUrl,
        source_url: videoUrl,
        format: 'mp4',
        quality: metadata.resolution || '',
        author: metadata.author || '',
        site_name: metadata.siteName || '',
      });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      } else {
        setUploaded(true);
        toast({ title: 'Uploaded!', description: 'Video saved to your library.' });
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const renderSourceLabel = (item: { quality?: string; format?: string; size?: string }, i: number) => {
    const parts: string[] = [];
    if (item.quality) parts.push(item.quality);
    if (item.format) parts.push(item.format.toUpperCase());
    if (item.size) parts.push(item.size);
    return parts.length > 0 ? parts.join(' · ') : `Video ${i + 1}`;
  };

  // Merge picker items and videoSources for a unified download list
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
    allSources.push({ url: result.audio, label: 'Audio Only', isAudio: true });
  }

  // Add scraped video sources not already present
  if (result.videoSources) {
    const existingUrls = new Set(allSources.map(s => s.url));
    result.videoSources.forEach((src, i) => {
      if (!existingUrls.has(src.url)) {
        allSources.push({ url: src.url, label: renderSourceLabel(src, i) });
      }
    });
  }

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
            </>
          )}

          {/* Download section */}
          {result.success && allSources.length > 0 && (
            <div className="space-y-2">
              {allSources.length > 1 && (
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <FileVideo className="h-4 w-4" />
                  {allSources.length} download options found
                </p>
              )}
              <div className="grid gap-2">
                {allSources.map((source, i) => (
                  <Button
                    key={i}
                    variant={i === 0 ? 'default' : 'secondary'}
                    onClick={() => forceDownload(source.url)}
                    className={`w-full justify-between h-12 rounded-xl ${i === 0 ? 'bg-primary text-primary-foreground font-semibold' : ''}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Download className="h-4 w-4 shrink-0" />
                      <span className="truncate">{source.label}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {source.isAudio && (
                        <span className="text-xs opacity-70">🎵</span>
                      )}
                      <ExternalLink className="h-4 w-4 opacity-60" />
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Upload to Library */}
          {result.success && (
            <div className="pt-1">
              {uploaded ? (
                <Button
                  onClick={() => navigate('/videos')}
                  className="w-full h-12 rounded-xl font-semibold bg-accent text-accent-foreground"
                >
                  <Check className="h-4 w-4 mr-2" />
                  View My Videos
                </Button>
              ) : (
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full h-12 rounded-xl font-semibold"
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {uploading ? 'Uploading to Library...' : 'Upload to My Library'}
                </Button>
              )}
            </div>
          )}

          {result.success && allSources.length === 0 && (
            <div className="rounded-xl bg-secondary/50 border border-border p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Video metadata retrieved. No direct download links were found — the platform may use DRM or require authentication.
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

          {!result.success && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
              {result.error || 'Could not process this video. The platform may not be supported.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
