import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Zap, Users, Shield, ArrowLeft, CheckCircle } from 'lucide-react';
import UrlInput from '@/components/UrlInput';
import { Progress } from '@/components/ui/progress';
import { fetchVideo, type VideoResult } from '@/lib/api/video';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';

interface PlatformConfig {
  slug: string;
  name: string;
  title: string;
  description: string;
  metaDescription: string;
  features: string[];
  placeholder: string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  'youtube-downloader': {
    slug: 'youtube-downloader',
    name: 'YouTube',
    title: 'YouTube Video Downloader — Free HD Download | Incognito Zone',
    description: 'Download YouTube videos in HD, Full HD, 4K quality. No watermark, no sign-up required.',
    metaDescription: 'Free YouTube video downloader. Download YouTube videos in HD 720p, 1080p, 4K. No watermark, no limits. Fast & secure with Incognito Zone.',
    features: ['HD & 4K quality options', 'Audio-only MP3 extraction', 'No watermarks', 'Shorts & Playlists supported'],
    placeholder: 'Paste YouTube video URL...',
  },
  'tiktok-downloader': {
    slug: 'tiktok-downloader',
    name: 'TikTok',
    title: 'TikTok Video Downloader — No Watermark | Incognito Zone',
    description: 'Download TikTok videos without watermark in HD quality. Save any TikTok to your device.',
    metaDescription: 'Download TikTok videos without watermark for free. HD quality, no sign-up. Save TikTok videos instantly with Incognito Zone.',
    features: ['No watermark downloads', 'HD quality', 'Audio extraction', 'Fast processing'],
    placeholder: 'Paste TikTok video URL...',
  },
  'facebook-downloader': {
    slug: 'facebook-downloader',
    name: 'Facebook',
    title: 'Facebook Video Downloader — HD & SD | Incognito Zone',
    description: 'Download Facebook videos including Reels, Watch, and public posts. HD and SD quality.',
    metaDescription: 'Free Facebook video downloader. Download FB videos, Reels & Watch content in HD. No login required. Incognito Zone.',
    features: ['Reels & Watch support', 'HD & SD quality', 'Public video downloads', 'No Facebook login needed'],
    placeholder: 'Paste Facebook video URL...',
  },
  'instagram-downloader': {
    slug: 'instagram-downloader',
    name: 'Instagram',
    title: 'Instagram Video Downloader — Reels & Posts | Incognito Zone',
    description: 'Download Instagram Reels, IGTV, and video posts. Save Instagram content in HD quality.',
    metaDescription: 'Download Instagram Reels, IGTV & video posts for free. HD quality, fast & secure. No login needed. Incognito Zone.',
    features: ['Reels downloads', 'IGTV support', 'HD quality', 'Story saver'],
    placeholder: 'Paste Instagram video URL...',
  },
  'twitter-downloader': {
    slug: 'twitter-downloader',
    name: 'Twitter / X',
    title: 'Twitter Video Downloader — Download X Videos | Incognito Zone',
    description: 'Download videos from Twitter/X posts. Multiple quality options available.',
    metaDescription: 'Free Twitter/X video downloader. Download videos from tweets in HD. Multiple quality options. Incognito Zone.',
    features: ['Tweet video downloads', 'Multiple quality options', 'GIF downloads', 'Fast extraction'],
    placeholder: 'Paste Twitter/X video URL...',
  },
  'video-downloader': {
    slug: 'video-downloader',
    name: 'Universal',
    title: 'Free Online Video Downloader — All Platforms | Incognito Zone',
    description: 'Download videos from any platform. YouTube, TikTok, Facebook, Instagram, Twitter, Reddit, Vimeo and more.',
    metaDescription: 'Free online video downloader for all platforms. Download from YouTube, TikTok, Instagram, Facebook, Twitter & more. No sign-up. Incognito Zone.',
    features: ['100+ platforms supported', 'HD & 4K quality', 'No watermarks', 'Audio extraction'],
    placeholder: 'Paste any video URL...',
  },
};

const PlatformLanding = ({ platform }: { platform: string }) => {
  const config = PLATFORMS[platform] || PLATFORMS['video-downloader'];
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const downloadCount = useMemo(() => {
    const launchDate = new Date('2026-01-01');
    const now = new Date();
    const daysSinceLaunch = Math.max(0, Math.floor((now.getTime() - launchDate.getTime()) / 86400000));
    let total = 12847;
    for (let d = 0; d <= daysSinceLaunch; d++) {
      total += 70 + ((d * 7 + 13) % 31);
    }
    return total;
  }, []);

  const handleFetch = async (url: string) => {
    setIsLoading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => prev >= 90 ? prev : prev + Math.random() * 12 + 3);
    }, 400);

    try {
      const data = await fetchVideo(url);
      setProgress(100);
      clearInterval(interval);

      if (data.success) {
        const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        setTimeout(() => navigate(`/watch/${uid}`, { state: { result: data } }), 800);
      } else {
        toast({ title: 'Could not process video', description: data.error || 'Try a different URL.', variant: 'destructive' });
      }
    } catch {
      setProgress(100);
      clearInterval(interval);
      toast({ title: 'Connection error', description: 'Failed to connect. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>{config.title}</title>
        <meta name="description" content={config.metaDescription} />
        <meta property="og:title" content={config.title} />
        <meta property="og:description" content={config.metaDescription} />
        <meta property="og:url" content={`https://www.incognito-zone.xyz/${config.slug}`} />
        <link rel="canonical" href={`https://www.incognito-zone.xyz/${config.slug}`} />
      </Helmet>

      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center px-4 py-8 md:py-20">
        {/* Nav */}
        <div className="w-full max-w-3xl flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> Home
          </Button>
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono font-semibold text-foreground">{downloadCount.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">downloads</span>
          </div>
        </div>

        <h1 className="text-2xl md:text-5xl font-bold text-center max-w-3xl leading-tight mb-3">
          {config.name === 'Universal' ? 'Free Video Downloader' : `${config.name} Video Downloader`}{' '}
          <span className="text-primary glow-text">— Free & Fast</span>
        </h1>

        <p className="text-sm md:text-lg text-muted-foreground text-center max-w-xl mb-8 px-2">
          {config.description}
        </p>

        <UrlInput onSubmit={handleFetch} isLoading={isLoading} />

        {isLoading && (
          <div className="w-full max-w-2xl mx-auto mt-6 space-y-2">
            <Progress value={progress} className="h-2 bg-secondary/50" />
            <p className="text-xs text-center text-muted-foreground font-mono animate-pulse">Fetching video data...</p>
          </div>
        )}

        {/* Features grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12 w-full max-w-3xl">
          {config.features.map((feature, i) => (
            <div key={i} className="glass rounded-xl p-3 md:p-4 flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-xs md:text-sm font-medium">{feature}</span>
            </div>
          ))}
        </div>

        {/* SEO content */}
        <section className="mt-12 md:mt-20 w-full max-w-3xl space-y-6">
          <h2 className="text-lg md:text-2xl font-semibold text-center">
            How to Download {config.name} Videos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Copy URL', desc: `Copy the ${config.name} video link from your browser or app.` },
              { step: '2', title: 'Paste & Fetch', desc: 'Paste the URL above and click Fetch to process the video.' },
              { step: '3', title: 'Download', desc: 'Choose your quality and download — no sign-up needed.' },
            ].map((s, i) => (
              <div key={i} className="glass rounded-2xl p-5 text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <span className="text-primary font-bold">{s.step}</span>
                </div>
                <h3 className="font-semibold text-sm">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12 w-full max-w-3xl space-y-4">
          <h2 className="text-lg md:text-xl font-semibold text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              { q: `Is it free to download ${config.name} videos?`, a: 'Yes, completely free. No sign-up, no hidden fees.' },
              { q: 'What quality options are available?', a: 'We offer HD, Full HD, and 4K when available, plus audio-only extraction.' },
              { q: 'Is it safe to use?', a: 'Absolutely. We don\'t store your data and all processing is server-side with ad filtering.' },
            ].map((faq, i) => (
              <div key={i} className="glass rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-1">{faq.q}</h3>
                <p className="text-xs text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          © 2026 Incognito Zone. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export { PLATFORMS };
export default PlatformLanding;
