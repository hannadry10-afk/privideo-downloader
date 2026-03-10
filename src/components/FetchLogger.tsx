import { useState, useEffect, useRef } from 'react';
import { Terminal, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface FetchLogEntry {
  message: string;
  type: 'info' | 'success' | 'warn' | 'step';
  timestamp: number;
}

interface FetchLoggerProps {
  isLoading: boolean;
  url: string;
  isDone: boolean;
  hasError: boolean;
}

const STEP_MESSAGES: { delay: number; msg: string; type: FetchLogEntry['type'] }[] = [
  { delay: 0, msg: 'Initializing fetch engine...', type: 'step' },
  { delay: 400, msg: 'Resolving URL and following redirects...', type: 'info' },
  { delay: 900, msg: 'Detecting platform...', type: 'step' },
  { delay: 1400, msg: 'Trying Cobalt API (multi-platform)...', type: 'info' },
  { delay: 2200, msg: 'Scanning page HTML for video sources...', type: 'step' },
  { delay: 3000, msg: 'Extracting OG meta tags & JSON-LD...', type: 'info' },
  { delay: 3600, msg: 'Parsing SSR data blobs for stream URLs...', type: 'info' },
  { delay: 4200, msg: 'Checking embedded players & iframes...', type: 'step' },
  { delay: 5000, msg: 'Verifying video sources (HEAD + ranged GET)...', type: 'info' },
  { delay: 5800, msg: 'Resolving CDN links & quality options...', type: 'step' },
];

const PLATFORM_MESSAGES: Record<string, { delay: number; msg: string; type: FetchLogEntry['type'] }[]> = {
  youtube: [
    { delay: 1600, msg: 'YouTube detected → trying Invidious API...', type: 'step' },
    { delay: 2800, msg: 'Fallback → querying Piped API instances...', type: 'info' },
    { delay: 3800, msg: 'Fetching format streams & adaptive formats...', type: 'info' },
  ],
  tiktok: [
    { delay: 1600, msg: 'TikTok detected → trying TikWM API...', type: 'step' },
    { delay: 2800, msg: 'Extracting no-watermark HD source...', type: 'info' },
    { delay: 3600, msg: 'Fallback → scraping mobile SSR rehydration data...', type: 'info' },
  ],
  twitter: [
    { delay: 1600, msg: 'Twitter/X detected → querying fxtwitter API...', type: 'step' },
    { delay: 2800, msg: 'Fallback → scraping Nitter proxy instances...', type: 'info' },
    { delay: 3600, msg: 'Resolving video variants & bitrates...', type: 'info' },
  ],
  instagram: [
    { delay: 1600, msg: 'Instagram detected → trying ddinstagram proxy...', type: 'step' },
    { delay: 2800, msg: 'Scanning embed endpoint for video_url...', type: 'info' },
    { delay: 3600, msg: 'Extracting CDN links from fbcdn/cdninstagram...', type: 'info' },
  ],
  facebook: [
    { delay: 1600, msg: 'Facebook detected → trying mobile variants...', type: 'step' },
    { delay: 2800, msg: 'Parsing playable_url & hd_src keys...', type: 'info' },
  ],
};

function detectPlatform(url: string): string | null {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  return null;
}

const FetchLogger = ({ isLoading, url, isDone, hasError }: FetchLoggerProps) => {
  const [logs, setLogs] = useState<FetchLogEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (isLoading && url) {
      setLogs([]);
      setVisible(true);

      const platform = detectPlatform(url);
      const allSteps = [...STEP_MESSAGES];

      // Insert platform-specific messages
      if (platform && PLATFORM_MESSAGES[platform]) {
        allSteps.push(...PLATFORM_MESSAGES[platform]);
      }

      // Sort by delay
      allSteps.sort((a, b) => a.delay - b.delay);

      // Add initial connection log
      const domainMatch = url.match(/https?:\/\/([^/]+)/);
      const domain = domainMatch?.[1] || url;
      setLogs([{ message: `Connecting to ${domain}...`, type: 'info', timestamp: Date.now() }]);

      const timers: ReturnType<typeof setTimeout>[] = [];
      allSteps.forEach((step) => {
        const t = setTimeout(() => {
          setLogs((prev) => [...prev, { message: step.msg, type: step.type, timestamp: Date.now() }]);
        }, step.delay + 300);
        timers.push(t);
      });

      timersRef.current = timers;
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [isLoading, url]);

  // On done/error: add final log, then fade out
  useEffect(() => {
    if (!isLoading && visible && (isDone || hasError)) {
      timersRef.current.forEach(clearTimeout);

      const finalMsg = hasError
        ? 'Connection failed. Please try again.'
        : 'Fetch complete — rendering results.';
      const finalType: FetchLogEntry['type'] = hasError ? 'warn' : 'success';

      setLogs((prev) => [...prev, { message: finalMsg, type: finalType, timestamp: Date.now() }]);

      const hideTimer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(hideTimer);
    }
  }, [isLoading, isDone, hasError, visible]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!visible || logs.length === 0) return null;

  const isFinished = !isLoading && (isDone || hasError);

  return (
    <div
      className={`w-full max-w-2xl mx-auto mt-6 transition-all duration-500 ${
        isFinished ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="glass rounded-xl overflow-hidden border border-border/50">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-secondary/30">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-mono font-medium text-muted-foreground">fetch-engine</span>
          <div className="ml-auto flex items-center gap-1.5">
            {isLoading && (
              <Loader2 className="h-3 w-3 text-primary animate-spin" />
            )}
            {isDone && !hasError && (
              <CheckCircle2 className="h-3 w-3 text-green-400" />
            )}
            {hasError && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
            <span className="text-[10px] font-mono text-muted-foreground">
              {isLoading ? 'processing...' : isDone ? 'done' : 'error'}
            </span>
          </div>
        </div>

        {/* Log entries */}
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto p-3 space-y-1 scrollbar-thin"
        >
          {logs.map((log, i) => (
            <div
              key={i}
              className="animate-fade-in flex items-start gap-2 text-xs font-mono leading-relaxed"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className="text-muted-foreground/50 shrink-0 select-none w-6 text-right">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={
                  log.type === 'success'
                    ? 'text-green-400'
                    : log.type === 'warn'
                    ? 'text-destructive'
                    : log.type === 'step'
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }
              >
                {log.type === 'step' && '▸ '}
                {log.type === 'success' && '✓ '}
                {log.type === 'warn' && '✗ '}
                {log.message}
              </span>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/40">
              <span className="w-6" />
              <span className="inline-block w-1.5 h-3.5 bg-primary/60 animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FetchLogger;
