import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, Smartphone, Unlock, CheckCircle2, Download } from 'lucide-react';
import UrlInput from '@/components/UrlInput';
import { Progress } from '@/components/ui/progress';
import { fetchVideo, type VideoResult } from '@/lib/api/video';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import SiteVisitsTicker from '@/components/SiteVisitsTicker';
import PwaInstallBanner from '@/components/PwaInstallBanner';

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
  '💾 Preparing download options...',
];

const PLATFORMS = [
  'YouTube', 'TikTok', 'Instagram', 'Twitter/X', 'Facebook', 'Reddit',
  'Vimeo', 'Dailymotion', 'Twitch', 'Pinterest', 'Loom', 'VK',
  'Bilibili', 'Kick', 'Odysee', '9GAG', 'Imgur',
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
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] md:w-[800px] h-[400px] md:h-[800px] bg-primary/5 rounded-full blur-[120px]" />

      <div className="relative z-10 flex flex-col">
        <Navbar />

        <div className="flex flex-col items-center px-4 py-6 md:py-14">
          {/* Site visits ticker */}
          <div className="mb-4">
            <SiteVisitsTicker />
          </div>

          {/* Hero badge */}
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1.5 mb-4 animate-float">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] md:text-sm font-medium text-muted-foreground">
              Free & Open Source Video Downloader
            </span>
          </div>

          <h1 className="text-2xl md:text-6xl font-bold text-center max-w-4xl leading-tight mb-2 md:mb-4">
            Download Any Video,{' '}
            <span className="text-primary glow-text">Anywhere</span>
          </h1>

          <p className="text-xs md:text-base text-muted-foreground text-center max-w-lg mb-5 md:mb-8 px-2">
            Paste a video link from any platform. We'll fetch, preview, and let you download — no sign-up required.
          </p>

          {/* URL Input */}
          <UrlInput onSubmit={handleFetch} isLoading={isLoading} />

          {/* Loading */}
          {isLoading && (
            <div className="w-full max-w-2xl mx-auto mt-4 space-y-1.5">
              <Progress value={progress} className="h-1.5 bg-secondary/50" />
              <p className="text-[10px] text-center text-muted-foreground font-mono animate-pulse">
                {loadingMsg}
              </p>
            </div>
          )}

          {/* Paywall highlight */}
          <div className="w-full max-w-4xl mt-8 md:mt-12">
            <div className="glass rounded-xl p-4 md:p-6 border border-primary/20 bg-primary/5 flex items-center gap-3 md:gap-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Unlock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-bold mb-0.5">Bypass Paywalls & Premium Content</h3>
                <p className="text-[11px] md:text-sm text-muted-foreground">Access videos from premium platforms using direct URLs. No login needed.</p>
              </div>
            </div>
          </div>

          {/* Features - compact */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6 md:mt-10 w-full max-w-4xl">
            {[
              { icon: Download, title: 'Multi-Platform', desc: '1000+ sites supported' },
              { icon: Zap, title: 'Lightning Fast', desc: 'No watermarks or ads' },
              { icon: Shield, title: 'Private & Secure', desc: 'No tracking or cookies' },
              { icon: Smartphone, title: 'Works Everywhere', desc: 'Desktop, tablet & mobile' },
            ].map((f, i) => (
              <div key={i} className="glass rounded-xl p-3 md:p-5 space-y-1.5 hover:border-primary/30 transition-all group">
                <div className="h-7 w-7 md:h-9 md:w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <f.icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-xs md:text-sm">{f.title}</h3>
                <p className="text-[10px] md:text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Platforms */}
          <div className="w-full max-w-4xl mt-8 md:mt-12">
            <h2 className="text-sm md:text-lg font-semibold text-center mb-3 md:mb-5">Supported Platforms</h2>
            <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
              {PLATFORMS.map((p) => (
                <span key={p} className="glass rounded-full px-2 py-1 text-[10px] md:text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-default">
                  {p}
                </span>
              ))}
              <span className="glass rounded-full px-2 py-1 text-[10px] md:text-xs font-medium text-primary">+ 1000 more</span>
            </div>
          </div>

          {/* How it works */}
          <div className="w-full max-w-4xl mt-8 md:mt-12">
            <h2 className="text-sm md:text-lg font-semibold text-center mb-4 md:mb-6">How It Works</h2>
            <div className="grid grid-cols-3 gap-3 md:gap-6">
              {[
                { step: '1', title: 'Paste URL', desc: 'Copy video link and paste it above.' },
                { step: '2', title: 'Fetch & Preview', desc: 'We extract metadata and options.' },
                { step: '3', title: 'Download', desc: 'Choose quality and download.' },
              ].map((s) => (
                <div key={s.step} className="text-center space-y-1.5 md:space-y-2">
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                    <span className="text-primary font-bold text-xs md:text-sm">{s.step}</span>
                  </div>
                  <h3 className="font-semibold text-xs md:text-sm">{s.title}</h3>
                  <p className="text-[10px] md:text-xs text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="w-full max-w-3xl mt-8 md:mt-12">
            <h2 className="text-sm md:text-lg font-semibold text-center mb-3 md:mb-6">FAQ</h2>
            <div className="space-y-2">
              {[
                { q: 'Is this really free?', a: 'Yes, 100% free with no hidden fees or limits.' },
                { q: 'Do you store my data?', a: 'No. We never store videos or browsing data.' },
                { q: 'What quality is supported?', a: 'Up to 4K depending on the source platform.' },
              ].map((faq, i) => (
                <div key={i} className="glass rounded-lg p-3 space-y-1">
                  <h3 className="font-medium text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                    {faq.q}
                  </h3>
                  <p className="text-[11px] text-muted-foreground pl-[18px]">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-8 md:mt-14 w-full max-w-4xl border-t border-border pt-4 pb-6">
            <p className="text-[10px] text-muted-foreground text-center">
              © 2026 Incognito Zone. All rights reserved.
            </p>
          </footer>
          <PwaInstallBanner />
        </div>
      </div>
    </div>
  );
};

export default Index;
