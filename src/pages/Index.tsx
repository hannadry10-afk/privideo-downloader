import { useState, useMemo } from 'react';
import { Download, Zap, Users } from 'lucide-react';
import UrlInput from '@/components/UrlInput';
import VideoPreview from '@/components/VideoPreview';
import VideoSkeleton from '@/components/VideoSkeleton';
import FetchLogger from '@/components/FetchLogger';
import { fetchVideo, type VideoResult } from '@/lib/api/video';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [fetchUrl, setFetchUrl] = useState('');
  const [fetchError, setFetchError] = useState(false);
  const { toast } = useToast();

  // Simulated download counter: base + 70-100 per day since launch
  const downloadCount = useMemo(() => {
    const launchDate = new Date('2026-01-01');
    const now = new Date();
    const daysSinceLaunch = Math.max(0, Math.floor((now.getTime() - launchDate.getTime()) / 86400000));
    // Deterministic pseudo-random per day (seeded by day count)
    let total = 12847; // base number
    for (let d = 0; d <= daysSinceLaunch; d++) {
      const daily = 70 + ((d * 7 + 13) % 31); // 70-100 range
      total += daily;
    }
    return total;
  }, []);

  const handleFetch = async (url: string) => {
    setIsLoading(true);
    setResult(null);
    setFetchUrl(url);
    setFetchError(false);

    try {
      const data = await fetchVideo(url);
      setResult(data);

      if (!data.success) {
        setFetchError(true);
        toast({
          title: 'Could not process video',
          description: data.error || 'Try a different URL or platform.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching video:', error);
      setFetchError(true);
      toast({
        title: 'Connection error',
        description: 'Failed to connect to the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center px-4 py-16 md:py-24">
        {/* Download counter */}
        <div className="w-full max-w-3xl flex justify-end mb-4">
          <div className="flex items-center gap-2 glass rounded-full px-4 py-1.5">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-mono font-semibold text-foreground">
              {downloadCount.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">downloads</span>
          </div>
        </div>

        {/* Hero */}
        <div className="flex items-center gap-2 glass rounded-full px-4 py-2 mb-8 animate-float">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">
            Free & Open Source Video Downloader
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-center max-w-3xl leading-tight mb-4">
          Download Any Video,{' '}
          <span className="text-primary glow-text">Anywhere</span>
        </h1>

        <p className="text-lg text-muted-foreground text-center max-w-xl mb-12">
          Paste a video link from any platform. We'll fetch the metadata, preview it, and let you download — no sign-up required.
        </p>

        {/* URL Input */}
        <UrlInput onSubmit={handleFetch} isLoading={isLoading} />

        {/* Fetch Logger */}
        <FetchLogger
          isLoading={isLoading}
          url={fetchUrl}
          isDone={!!result}
          hasError={fetchError}
        />

        {/* Result */}
        {!isLoading && result && <VideoPreview result={result} />}

        {/* Features */}
        {!result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20 w-full max-w-3xl">
            {[
              {
                icon: Download,
                title: 'Multi-Platform',
                desc: 'YouTube, TikTok, Instagram, Twitter, Reddit, Vimeo and many more.',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                desc: 'Powered by open-source tools. No watermarks, no limits.',
              },
              {
                icon: Download,
                title: 'Quality Options',
                desc: 'Choose resolution, format, and download audio-only tracks.',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-6 space-y-3 hover:border-primary/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-20 text-center text-sm text-muted-foreground">
          © 2026 Privideo Downloader. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default Index;
