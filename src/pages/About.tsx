import { Link } from 'react-router-dom';
import { Download, Shield, Zap, Globe, Heart } from 'lucide-react';
import Navbar from '@/components/Navbar';

const About = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
      <h1 className="text-2xl md:text-4xl font-bold mb-4">About Incognito Zone</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Incognito Zone is a free, open-source video downloader that lets you save videos from 1000+ platforms — no sign-up, no watermarks, no tracking.
      </p>

      <div className="space-y-6">
        {[
          { icon: Download, title: 'Multi-Platform', desc: 'Download from YouTube, TikTok, Instagram, Twitter, Facebook, Reddit, Vimeo and hundreds more.' },
          { icon: Zap, title: 'Fast & Free', desc: 'No ads, no premium tiers, no limits. Powered by open-source tools.' },
          { icon: Shield, title: 'Privacy First', desc: 'We don't track you, store cookies, or keep your download history.' },
          { icon: Globe, title: 'Works Everywhere', desc: 'Fully responsive. Install as an app on your phone for quick access.' },
        ].map((item, i) => (
          <div key={i} className="glass rounded-xl p-4 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-0.5">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          Made with <Heart className="h-3 w-3 text-destructive" /> by the community
        </p>
      </div>
    </div>
  </div>
);

export default About;
