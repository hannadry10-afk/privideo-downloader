import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Globe, TrendingUp, Eye } from 'lucide-react';

interface SiteVisit {
  id: string;
  site_name: string;
  url: string;
  visit_count: number;
  last_visited_at: string;
}

const RANDOM_SITES = [
  'youtube.com', 'tiktok.com', 'instagram.com', 'twitter.com', 'reddit.com',
  'vimeo.com', 'dailymotion.com', 'twitch.tv', 'facebook.com', 'pinterest.com',
  'bilibili.com', 'kick.com', 'rumble.com', 'odysee.com', 'loom.com',
];

const SiteVisitTracker = () => {
  const [totalVisits, setTotalVisits] = useState(0);
  const [recentSites, setRecentSites] = useState<SiteVisit[]>([]);
  const [displayBatch, setDisplayBatch] = useState<SiteVisit[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [batchIndex, setBatchIndex] = useState(0);

  // Fetch real data
  const fetchVisits = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_visits')
      .select('*')
      .order('last_visited_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setRecentSites(data);
      const total = data.reduce((sum, s) => sum + s.visit_count, 0);
      // Add base count for visual appeal
      setTotalVisits(total + 4200);
    }
  }, []);

  useEffect(() => {
    fetchVisits();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('site_visits_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'site_visits',
      }, () => {
        fetchVisits();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchVisits]);

  // Generate display items (mix real + random)
  useEffect(() => {
    const generateBatch = (): SiteVisit[] => {
      const batch: SiteVisit[] = [];
      const realSlice = recentSites.slice(batchIndex * 3, batchIndex * 3 + 3);
      batch.push(...realSlice);

      // Fill remaining with random
      while (batch.length < 4) {
        const site = RANDOM_SITES[Math.floor(Math.random() * RANDOM_SITES.length)];
        batch.push({
          id: crypto.randomUUID(),
          site_name: site,
          url: `https://${site}`,
          visit_count: Math.floor(Math.random() * 50) + 5,
          last_visited_at: new Date().toISOString(),
        });
      }
      return batch;
    };

    setDisplayBatch(generateBatch());

    // Rotate every 30 seconds
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setBatchIndex(prev => prev + 1);
        setDisplayBatch(generateBatch());
        setIsVisible(true);
      }, 500);
    }, 30000);

    return () => clearInterval(interval);
  }, [recentSites, batchIndex]);

  return (
    <div className="w-full space-y-2">
      {/* Visit counter */}
      <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1 w-fit ml-auto">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-mono font-semibold text-foreground">
          {totalVisits.toLocaleString()}
        </span>
        <span className="text-[10px] text-muted-foreground">visits</span>
      </div>

      {/* Animated site list */}
      <div
        className={`transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      >
        <div className="glass rounded-xl p-2 space-y-1">
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-medium text-muted-foreground">Recent Activity</span>
          </div>
          {displayBatch.map((site, i) => (
            <div
              key={site.id}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/30 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <Globe className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] text-foreground truncate flex-1">
                {site.site_name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                {site.visit_count}×
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SiteVisitTracker;
