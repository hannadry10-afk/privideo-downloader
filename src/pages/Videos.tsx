import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Film, Globe, User, Calendar, Clock, Download, ExternalLink, Trash2, ArrowLeft, Search, ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StoredVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  video_url: string;
  source_url: string;
  format: string;
  quality: string;
  size: string;
  author: string;
  date_uploaded: string;
  site_name: string;
  created_at: string;
}

const Videos = () => {
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeVideo, setActiveVideo] = useState<StoredVideo | null>(null);
  const perPage = 12;
  const { toast } = useToast();

  const fetchVideos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: 'Failed to load videos.', variant: 'destructive' });
    } else {
      setVideos((data as StoredVideo[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('videos').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete video.', variant: 'destructive' });
    } else {
      setVideos(prev => prev.filter(v => v.id !== id));
      toast({ title: 'Deleted', description: 'Video removed.' });
    }
  };

  const forceDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filtered = videos.filter(v =>
    !search || v.title.toLowerCase().includes(search.toLowerCase()) ||
    v.author.toLowerCase().includes(search.toLowerCase()) ||
    v.site_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-12 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">My Videos</h1>
              <p className="text-sm text-muted-foreground">{videos.length} video{videos.length !== 1 ? 's' : ''} uploaded</p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos..."
              className="pl-10 h-10 bg-secondary/50 border-0 rounded-xl"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-secondary" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-secondary rounded w-full" />
                  <div className="h-3 bg-secondary rounded w-2/3" />
                  <div className="h-8 bg-secondary rounded w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center">
            <Film className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {search ? 'No matching videos' : 'No videos yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search ? 'Try a different search term.' : 'Fetch a video and upload it to see it here.'}
            </p>
            {!search && (
              <Link to="/">
                <Button className="rounded-xl">Go to Downloader</Button>
              </Link>
            )}
          </div>
        )}

        {/* Video grid */}
        {!loading && filtered.length > 0 && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {paginated.map((video) => (
              <div key={video.id} className="glass rounded-2xl overflow-hidden hover:border-primary/30 transition-colors group">
                <div
                  className="relative aspect-video bg-secondary overflow-hidden cursor-pointer"
                  onClick={() => setActiveVideo(video)}
                >
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
                      <Film className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100">
                      <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
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
                    {video.title}
                  </h4>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {video.author && (
                      <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{video.author}</span>
                    )}
                    {video.site_name && (
                      <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />{video.site_name}</span>
                    )}
                    {video.date_uploaded && (
                      <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{formatDate(video.date_uploaded)}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      onClick={() => forceDownload(video.video_url)}
                      variant="secondary"
                      className="flex-1 h-8 rounded-lg text-[11px] font-medium"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                    <Button
                      onClick={() => handleDelete(video.id)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('dots');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === 'dots' ? (
                    <span key={`dots-${i}`} className="text-muted-foreground text-sm px-1">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={page === item ? 'default' : 'ghost'}
                      className={`h-9 w-9 rounded-xl text-sm ${page === item ? '' : ''}`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          </>
        )}
      </div>

      {/* Video Player Modal */}
      <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden rounded-2xl border-border/50 bg-card">
          {activeVideo && (
            <div className="flex flex-col">
              <div className="relative aspect-video bg-black">
                <video
                  src={activeVideo.video_url}
                  controls
                  autoPlay
                  className="w-full h-full"
                  poster={activeVideo.thumbnail || undefined}
                />
              </div>
              <div className="p-4 sm:p-5 space-y-3">
                <h3 className="font-semibold text-base sm:text-lg leading-tight">{activeVideo.title}</h3>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {activeVideo.author && (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{activeVideo.author}</span>
                  )}
                  {activeVideo.site_name && (
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{activeVideo.site_name}</span>
                  )}
                  {activeVideo.duration && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{activeVideo.duration}</span>
                  )}
                  {activeVideo.date_uploaded && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(activeVideo.date_uploaded)}</span>
                  )}
                </div>
                {activeVideo.description && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{activeVideo.description}</p>
                )}
                <Button
                  onClick={() => forceDownload(activeVideo.video_url)}
                  className="rounded-xl h-10 font-medium w-full sm:w-auto"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Video
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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

export default Videos;
