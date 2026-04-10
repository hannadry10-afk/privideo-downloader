import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Download, Zap, Users, Shield, Globe, Headphones, MonitorPlay, Smartphone, Heart, ArrowRight, CheckCircle2, Lock, Unlock } from 'lucide-react';
import UrlInput from '@/components/UrlInput';
import { Progress } from '@/components/ui/progress';
import { fetchVideo, type VideoResult } from '@/lib/api/video';
import { useToast } from '@/hooks/use-toast';

const LOADING_MESSAGES = [
  '🤖 Our AI is processing your request...',
  '☕ Grab a coffee while we work on it...',
  '⚡ Almost there, hang tight...',
  '🔍 Scanning video sources...',
  '🎬 Extracting the good stuff...',
  '🧠 AI is doing its magic...',
  '📡 Connecting to the source...',
  '🚀 Nearly done, trust me...',
  '🎯 Locking onto the video stream...',
  '🔓 Bypassing restrictions...',
  '💾 Preparing download options...',
  '⏳ Just a few more seconds...',
];

const PLATFORMS = [
  'YouTube', 'TikTok', 'Instagram', 'Twitter/X', 'Facebook', 'Reddit',
  'Vimeo', 'Dailymotion', 'Twitch', 'Pinterest', 'Loom', 'VK',
  'Rutube', 'OK.ru', 'Bilibili', 'Kick', 'Odysee', 'PeerTube',
  '9GAG', 'Imgur', 'Bitchute', 'Coub', 'Wistia', 'Brightcove',
];

const STATS = [
  { label: 'Platforms', value: '1000+' },
  { label: 'Formats', value: 'MP4/WEBM' },
  { label: 'Quality', value: 'Up to 4K' },
  { label: 'Price', value: 'Free' },
];

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) return;
    const pick = () => setLoadingMsg(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
    pick();
    const id = setInterval(pick, 2500);
    return () => clearInterval(id);
  }, [isLoading]);

  const downloadCount = useMemo(() => {
    const launchDate = new Date('2026-01-01');
    const now = new Date();
    const daysSinceLaunch = Math.max(0, Math.floor((now.getTime() - launchDate.getTime()) / 86400000));
    let total = 4200;
    for (let d = 0; d <= daysSinceLaunch; d++) {
      total += 8 + ((d * 3 + 7) % 12);
    }
    return total;
  }, []);

  const handleFetch = async (url: string) => {
    setIsLoading(true);
    setResult(null);
    setFetchError(false);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 90 ? prev : prev + Math.random() * 12 + 3));
    }, 400);

    try {
      const data = await fetchVideo(url);
      setResult(data);
      setProgress(100);
      clearInterval(interval);

      if (data.success) {
        const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        setTimeout(() => navigate(`/watch/${uid}`, { state: { result: data } }), 800);
      } else {
        setFetchError(true);
        toast({ title: 'Could not process video', description: data.error || 'Try a different URL or platform.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error fetching video:', error);
      setFetchError(true);
      setProgress(100);
      clearInterval(interval);
      toast({ title: 'Connection error', description: 'Failed to connect to the server. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] md:w-[800px] h-[400px] md:h-[800px] bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[100px]" />
      <div className="absolute top-0 right-0 w-[200px] md:w-[400px] h-[200px] md:h-[400px] bg-primary/3 rounded-full blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center px-4 py-8 md:py-16">
        {/* Header bar - desktop only */}
        <div className="w-full max-w-5xl hidden md:flex justify-end items-center mb-12">
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-mono font-semibold text-foreground">{downloadCount.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">downloads</span>
            </div>
          </div>
        </div>

        {/* Mobile download counter */}
        <div className="w-full max-w-3xl flex justify-end mb-3 md:hidden">
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-mono font-semibold text-foreground">{downloadCount.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">downloads</span>
          </div>
        </div>

        {/* Hero */}
        <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5 mb-5 md:mb-6 animate-float">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs md:text-sm font-medium text-muted-foreground">
            Free & Open Source Video Downloader
          </span>
        </div>

        <h1 className="text-3xl md:text-7xl font-bold text-center max-w-4xl leading-tight mb-3 md:mb-4">
          Download Any Video,{' '}
          <span className="text-primary glow-text">Anywhere</span>
        </h1>

        <p className="text-sm md:text-lg text-muted-foreground text-center max-w-xl mb-6 md:mb-10 px-2">
          Paste a video link from any platform. We'll fetch the metadata, preview it, and let you download — no sign-up required.
        </p>

        {/* Stats row - desktop */}
        <div className="hidden md:flex gap-8 mb-10">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* URL Input */}
        <UrlInput onSubmit={handleFetch} isLoading={isLoading} />

        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="w-full max-w-2xl mx-auto mt-6 space-y-2">
            <Progress value={progress} className="h-2 bg-secondary/50" />
            <p className="text-xs text-center text-muted-foreground font-mono animate-pulse">
              {loadingMsg}
            </p>
          </div>
        )}

        {/* Paywall Bypass Highlight */}
        <div className="w-full max-w-5xl mt-10 md:mt-16">
          <div className="glass rounded-2xl p-5 md:p-8 border border-primary/20 bg-primary/5 flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Unlock className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center md:text-left">
              <h3 className="text-lg md:text-xl font-bold mb-1">Bypass Paywalls & Premium Content</h3>
              <p className="text-sm text-muted-foreground">Access videos from subscription-based and premium platforms using direct video URLs. No login needed — just paste the link and download.</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mt-8 md:mt-12 w-full max-w-5xl">
          {[
            { icon: Download, title: 'Multi-Platform', desc: 'YouTube, TikTok, Instagram, Twitter, Reddit, Vimeo and 1000+ more sites.' },
            { icon: Zap, title: 'Lightning Fast', desc: 'Powered by open-source tools. No watermarks, no limits, no ads.' },
            { icon: Shield, title: 'Private & Secure', desc: 'No tracking, no cookies, no data stored. Your downloads stay private.' },
            { icon: Smartphone, title: 'Works Everywhere', desc: 'Fully responsive. Works perfectly on desktop, tablet, and mobile.' },
          ].map((f, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-4 md:p-6 space-y-2 md:space-y-3 hover:border-primary/30 transition-all duration-300 group hover:shadow-[0_0_30px_-10px_hsl(185_80%_50%/0.2)]"
            >
              <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <f.icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm md:text-base">{f.title}</h3>
              <p className="text-xs md:text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Supported platforms - desktop */}
        <div className="hidden md:block w-full max-w-5xl mt-16">
          <h2 className="text-xl font-semibold text-center mb-6">
            Supported Platforms
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {PLATFORMS.map((p) => (
              <span key={p} className="glass rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors cursor-default">
                {p}
              </span>
            ))}
            <span className="glass rounded-full px-3 py-1.5 text-xs font-medium text-primary">
              + 1000 more
            </span>
          </div>
        </div>

        {/* How it works - desktop */}
        <div className="hidden md:block w-full max-w-5xl mt-16">
          <h2 className="text-xl font-semibold text-center mb-8">
            How It Works
          </h2>
          <div className="grid grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Paste URL', desc: 'Copy the video link from any supported platform and paste it above.' },
              { step: '2', title: 'Fetch & Preview', desc: 'We extract metadata, thumbnail, and all available download options.' },
              { step: '3', title: 'Download', desc: 'Choose your preferred quality and format, then download instantly.' },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                  <span className="text-primary font-bold text-lg">{s.step}</span>
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ - desktop */}
        <div className="hidden md:block w-full max-w-3xl mt-16">
          <h2 className="text-xl font-semibold text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {[
              { q: 'Is this really free?', a: 'Yes, 100% free with no hidden fees, no premium tiers, and no limits.' },
              { q: 'Do you store my downloaded videos?', a: 'No. We never store your videos or browsing data. Everything is processed in real-time.' },
              { q: 'What video qualities are supported?', a: 'We support up to 4K resolution depending on the source platform. Audio-only extraction is also available.' },
              { q: 'Can I download premium/paid videos?', a: 'Yes — if you have a direct video URL from a premium platform, our tool can process and extract it for download.' },
            ].map((faq, i) => (
              <div key={i} className="glass rounded-xl p-4 space-y-2">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  {faq.q}
                </h3>
                <p className="text-sm text-muted-foreground pl-6">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 md:mt-20 w-full max-w-5xl">
          <div className="border-t border-border pt-6 md:pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                Made with <Heart className="h-3 w-3 text-destructive" /> by the community
              </p>
              <div className="flex items-center gap-4">
                <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
              </div>
              <p className="text-xs text-muted-foreground">
                © 2026 Incognito Zone. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
