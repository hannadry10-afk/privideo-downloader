import { useState, useEffect } from 'react';
import { Globe, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SiteVisit {
  site_name: string;
  url: string;
  visit_count: number;
}

const SiteVisitsTicker = () => {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);

  const fetchVisits = async () => {
    const { data } = await supabase
      .from('site_visits')
      .select('site_name, url, visit_count')
      .order('visit_count', { ascending: false })
      .limit(10);

    if (data && data.length > 0) {
      setVisits(data);
      setTotalVisits(data.reduce((sum, v) => sum + v.visit_count, 0));
    }
  };

  useEffect(() => {
    fetchVisits();

    const channel = supabase
      .channel('site_visits_ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_visits' }, () => {
        fetchVisits();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (visits.length === 0) return null;

  // Extract display domain from url field (e.g. "https://youtube.com/..." → "youtube.com")
  const getDomain = (v: SiteVisit) => {
    try {
      return new URL(v.url).hostname.replace(/^www\./, '');
    } catch {
      return v.site_name || v.url;
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Visit count */}
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-mono font-semibold text-foreground">{totalVisits.toLocaleString()}</span>
        <span className="text-[10px] text-muted-foreground">visits</span>
      </div>

      {/* Scrolling ticker of sites */}
      <div className="overflow-hidden h-5 relative">
        <div className="animate-ticker flex gap-4 absolute whitespace-nowrap">
          {[...visits, ...visits].map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Globe className="h-2.5 w-2.5 text-primary/60" />
              {getDomain(v)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SiteVisitsTicker;
