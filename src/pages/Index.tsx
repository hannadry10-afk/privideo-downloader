import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Zap, ScanSearch, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UrlInput from '@/components/UrlInput';
import VideoPreview from '@/components/VideoPreview';
import VideoSkeleton from '@/components/VideoSkeleton';
import VideoGrid from '@/components/VideoGrid';
import ScanSkeleton from '@/components/ScanSkeleton';
import { fetchVideo, scanVideos, type VideoResult, type ScanResult } from '@/lib/api/video';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [lastUrl, setLastUrl] = useState('');
  const { toast } = useToast();

  const handleFetch = async (url: string) => {
    setIsLoading(true);
    setResult(null);
    setScanResult(null);
    setLastUrl(url);

    try {
      const data = await fetchVideo(url);
      setResult(data);

      if (!data.success) {
        toast({
          title: 'Could not process video',
          description: data.error || 'Try a different URL or platform.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error fetching video:', error);
      toast({
        title: 'Connection error',
        description: 'Failed to connect to the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanAll = async (url?: string) => {
    const targetUrl = url || lastUrl;
    if (!targetUrl) return;

    setIsScanning(true);
    setScanResult(null);
    setResult(null);
    setLastUrl(targetUrl);

    try {
      const data = await scanVideos(targetUrl);
      setScanResult(data);

      if (!data.success) {
        toast({
          title: 'Scan failed',
          description: data.error || 'Could not scan the website for videos.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: `Scan complete`,
          description: `Found ${data.totalFound || 0} video(s) on this page.`,
        });
      }
    } catch (error) {
      console.error('Error scanning:', error);
      toast({
        title: 'Connection error',
        description: 'Failed to connect to the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-16 md:py-24">
        {/* Nav */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <Link to="/videos">
            <Button variant="ghost" className="rounded-xl h-9 px-4 text-sm font-medium">
              <Film className="h-4 w-4 mr-2" />
              My Videos
            </Button>
          </Link>
        </div>

        {/* Hero */}
        <div className="flex items-center gap-2 glass rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-6 sm:mb-8 animate-float">
          <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          <span className="text-xs sm:text-sm font-medium text-muted-foreground">
            Free & Open Source Video Downloader
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-center max-w-3xl leading-tight mb-3 sm:mb-4">
          Download Any Video,{' '}
          <span className="text-primary glow-text">Anywhere</span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground text-center max-w-xl mb-8 sm:mb-12 px-2">
          Paste a video link from any platform. We'll fetch the metadata, preview it, and let you download — no sign-up required.
        </p>

        {/* URL Input */}
        <UrlInput onSubmit={handleFetch} isLoading={isLoading} />

        {/* Scan All Videos button */}
        {!isLoading && !isScanning && lastUrl && (
          <Button
            onClick={() => handleScanAll()}
            variant="secondary"
            className="mt-4 rounded-xl h-11 px-6 font-medium"
          >
            <ScanSearch className="h-4 w-4 mr-2" />
            Scan All Videos on This Page
          </Button>
        )}

        {/* Results */}
        {isLoading && <VideoSkeleton />}
        {isScanning && <ScanSkeleton />}
        {!isLoading && !isScanning && result && !scanResult && <VideoPreview result={result} />}
        {!isLoading && !isScanning && scanResult?.success && scanResult.videos && (
          <VideoGrid
            videos={scanResult.videos}
            siteName={scanResult.siteName}
            scannedUrl={scanResult.scannedUrl}
          />
        )}

        {/* Features */}
        {!result && !scanResult && !isLoading && !isScanning && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-12 sm:mt-20 w-full max-w-3xl px-1">
            {[
              {
                icon: Download,
                title: 'Multi-Platform',
                desc: 'YouTube, TikTok, Instagram, Twitter, Reddit, Vimeo and many more.',
              },
              {
                icon: ScanSearch,
                title: 'Site Scanner',
                desc: 'Scan any webpage to find and download all embedded videos at once.',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                desc: 'Powered by open-source tools. No watermarks, no limits.',
              },
            ].map((f, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-5 sm:p-6 space-y-2.5 sm:space-y-3 hover:border-primary/30 transition-colors"
              >
                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <f.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm sm:text-base">{f.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
