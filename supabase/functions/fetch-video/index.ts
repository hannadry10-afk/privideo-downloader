import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── In-memory cache (survives across warm invocations) ──
const resultCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(url: string): unknown | null {
  const entry = resultCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resultCache.delete(url);
    return null;
  }
  return entry.data;
}

function setCache(url: string, data: unknown) {
  // Evict oldest entries if cache grows too large
  if (resultCache.size > 500) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
  resultCache.set(url, { data, timestamp: Date.now() });
}

// ── Layer 1: Rate limiter (per IP, sliding window) ──
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 15;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// ── Layer 2: Burst / DDoS detection (short window) ──
const burstMap = new Map<string, { count: number; start: number }>();
const BURST_WINDOW_MS = 5_000; // 5 seconds
const BURST_MAX = 5; // max 5 requests in 5s

function isBurst(ip: string): boolean {
  const now = Date.now();
  const entry = burstMap.get(ip);
  if (!entry || now - entry.start > BURST_WINDOW_MS) {
    burstMap.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  return entry.count > BURST_MAX;
}

// ── Layer 3: Progressive ban (repeat offenders) ──
const banMap = new Map<string, { strikes: number; bannedUntil: number }>();

function checkBan(ip: string): boolean {
  const ban = banMap.get(ip);
  if (!ban) return false;
  if (Date.now() < ban.bannedUntil) return true;
  // Ban expired, reset
  banMap.delete(ip);
  return false;
}

function recordStrike(ip: string) {
  const ban = banMap.get(ip) || { strikes: 0, bannedUntil: 0 };
  ban.strikes++;
  // Exponential backoff: 1min, 5min, 30min, 2hr
  const durations = [60_000, 300_000, 1_800_000, 7_200_000];
  const idx = Math.min(ban.strikes - 1, durations.length - 1);
  ban.bannedUntil = Date.now() + durations[idx];
  banMap.set(ip, ban);
}

// ── Layer 4: SSRF protection ──
const BLOCKED_HOSTS = [
  /^localhost$/i, /^127\.\d+\.\d+\.\d+$/, /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/, /^\[::1?\]$/, /^169\.254\.\d+\.\d+$/,
  /\.local$/i, /\.internal$/i, /\.corp$/i,
  /metadata\.google\.internal/i, /169\.254\.169\.254/,
];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function validateUrl(raw: string): { valid: boolean; url?: URL; error?: string } {
  // Length check
  if (!raw || typeof raw !== 'string' || raw.length > 2048) {
    return { valid: false, error: 'Invalid or too-long URL' };
  }
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return { valid: false, error: 'Malformed URL' }; }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }
  const host = parsed.hostname;
  for (const pattern of BLOCKED_HOSTS) {
    if (pattern.test(host)) return { valid: false, error: 'Access to internal resources is forbidden' };
  }
  return { valid: true, url: parsed };
}

// ── Layer 5: Input sanitisation ──
function sanitizeInput(body: unknown): { url?: string; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const b = body as Record<string, unknown>;
  if (typeof b.url !== 'string') return { error: 'URL must be a string' };
  // Strip control chars & trim
  const cleaned = b.url.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!cleaned) return { error: 'URL is required' };
  return { url: cleaned };
}

// ── Periodic cleanup ──
let lastCleanup = Date.now();
function periodicCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 120_000) return; // every 2 min
  lastCleanup = now;
  for (const [k, v] of rateLimitMap) { if (now - v.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(k); }
  for (const [k, v] of burstMap) { if (now - v.start > BURST_WINDOW_MS * 2) burstMap.delete(k); }
  for (const [k, v] of banMap) { if (now > v.bannedUntil) banMap.delete(k); }
  if (resultCache.size > 500) {
    for (const [k, v] of resultCache) { if (now - v.timestamp > CACHE_TTL_MS) resultCache.delete(k); }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  periodicCleanup();

  try {
    // Layer 1 & 2: Rate limiting + burst detection
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    // Check ban first
    if (checkBan(clientIp)) {
      return jsonResponse({ success: false, error: 'Temporarily blocked due to excessive requests.' }, 429);
    }

    if (isBurst(clientIp)) {
      recordStrike(clientIp);
      return jsonResponse({ success: false, error: 'Too many requests. Slow down.' }, 429);
    }

    if (isRateLimited(clientIp)) {
      recordStrike(clientIp);
      return jsonResponse({ success: false, error: 'Rate limit exceeded. Please wait a moment before trying again.' }, 429);
    }

    // Layer 3: Content-type validation
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return jsonResponse({ success: false, error: 'Content-Type must be application/json' }, 415);
    }

    // Layer 4: Body size guard (reject > 10KB)
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 10240) {
      return jsonResponse({ success: false, error: 'Request body too large' }, 413);
    }

    // Layer 5: Parse & sanitize input
    let body: unknown;
    try { body = await req.json(); } catch { return jsonResponse({ success: false, error: 'Invalid JSON' }, 400); }

    const input = sanitizeInput(body);
    if (input.error || !input.url) {
      return jsonResponse({ success: false, error: input.error || 'URL is required' }, 400);
    }

    // Layer 4 continued: SSRF protection
    const urlCheck = validateUrl(input.url);
    if (!urlCheck.valid) {
      return jsonResponse({ success: false, error: urlCheck.error }, 400);
    }

    const url = input.url;

    // Sanitized log (no query params)
    const logUrl = urlCheck.url ? `${urlCheck.url.hostname}${urlCheck.url.pathname}` : 'unknown';
    console.log('Processing:', logUrl);


    // Check in-memory cache first
    const cached = getCached(url);
    if (cached) {
      console.log('Cache hit for:', url);
      return jsonResponse(cached);
    }

    // Check database cache (persistent across cold starts)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseKey);
      const { data: dbCached } = await sb
        .from('videos')
        .select('*')
        .eq('source_url', url)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (dbCached && dbCached.video_url) {
        // Check if cached entry is less than 1 hour old
        const age = Date.now() - new Date(dbCached.created_at).getTime();
        if (age < 60 * 60 * 1000) {
          console.log('DB cache hit for:', url);
          const dbResult = {
            success: true,
            type: 'direct' as const,
            url: dbCached.video_url,
            filename: `${(dbCached.title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')}.${dbCached.format || 'mp4'}`,
            metadata: {
              title: dbCached.title,
              description: dbCached.description || '',
              thumbnail: dbCached.thumbnail || '',
              duration: dbCached.duration || '',
              siteName: dbCached.site_name || '',
              type: 'video',
              author: dbCached.author || '',
            },
            videoSources: [{ url: dbCached.video_url, quality: dbCached.quality || 'HD', format: dbCached.format || 'mp4' }],
          };
          setCache(url, dbResult);
          return jsonResponse(dbResult);
        }
      }
    } catch (e) { console.log('DB cache check failed:', e); }

    // Fetch page with multiple user-agent strategies
    const pageData = await fetchPageDataWithRetry(url);

    // Helper to cache + return results
    const cacheAndReturn = (result: Record<string, unknown>) => {
      setCache(url, result);
      // Save to DB asynchronously (best-effort)
      if ((result as any).success && (result as any).url) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const sb = createClient(supabaseUrl, supabaseKey);
          const meta = (result as any).metadata || {};
          const sources = (result as any).videoSources || [];
          sb.from('videos').insert({
            video_url: (result as any).url || sources[0]?.url || '',
            source_url: url,
            title: meta.title || 'Untitled Video',
            description: meta.description || '',
            thumbnail: meta.thumbnail || '',
            duration: meta.duration || '',
            site_name: meta.siteName || '',
            author: meta.author || '',
            quality: sources[0]?.quality || '',
            format: sources[0]?.format || 'mp4',
            size: sources[0]?.size || '',
          }).then(() => {}).catch(() => {});
        } catch {}
      }
      return jsonResponse(result);
    };

    // Try cobalt API first (multiple instances)
    const cobaltResult = await tryCobaltMulti(url, pageData);
    if (cobaltResult) return cacheAndReturn(cobaltResult);

    // Direct video URL (mp4, m3u8, etc.) — handle immediately
    if (isDirectVideoUrl(url)) {
      const directResult = await tryDirectVideoUrl(url, pageData);
      if (directResult) return cacheAndReturn(directResult);
    }

    // Platform-specific extractors
    if (isYouTube(url)) {
      const invResult = await tryInvidious(url, pageData);
      if (invResult) return cacheAndReturn(invResult);
      const pipedResult = await tryPiped(url, pageData);
      if (pipedResult) return cacheAndReturn(pipedResult);
    }

    if (isTikTok(url)) {
      const ttResult = await tryTikTok(url, pageData);
      if (ttResult) return cacheAndReturn(ttResult);
    }

    if (isTwitter(url)) {
      const twResult = await tryTwitter(url, pageData);
      if (twResult) return cacheAndReturn(twResult);
    }

    if (isInstagram(url)) {
      const igResult = await tryInstagram(url, pageData);
      if (igResult) return cacheAndReturn(igResult);
    }

    if (isFacebook(url)) {
      const fbResult = await tryFacebook(url, pageData);
      if (fbResult) return cacheAndReturn(fbResult);
    }

    if (isDailymotion(url)) {
      const dmResult = await tryDailymotion(url, pageData);
      if (dmResult) return cacheAndReturn(dmResult);
    }

    if (isVimeo(url)) {
      const vimResult = await tryVimeo(url, pageData);
      if (vimResult) return cacheAndReturn(vimResult);
    }

    if (isRumble(url)) {
      const rResult = await tryRumble(url, pageData);
      if (rResult) return cacheAndReturn(rResult);
    }

    if (isStreamable(url)) {
      const stResult = await tryStreamable(url, pageData);
      if (stResult) return cacheAndReturn(stResult);
    }

    if (isRedditVideo(url)) {
      const rdResult = await tryReddit(url, pageData);
      if (rdResult) return cacheAndReturn(rdResult);
    }

    if (isTwitch(url)) {
      const twResult = await tryTwitch(url, pageData);
      if (twResult) return cacheAndReturn(twResult);
    }

    if (isBilibili(url)) {
      const blResult = await tryBilibili(url, pageData);
      if (blResult) return cacheAndReturn(blResult);
    }

    if (isOKru(url)) {
      const okResult = await tryOKru(url, pageData);
      if (okResult) return cacheAndReturn(okResult);
    }

    if (is9anime(url)) {
      const animeResult = await tryAnime(url, pageData);
      if (animeResult) return cacheAndReturn(animeResult);
    }

    if (isAdultSite(url)) {
      const adultResult = await tryAdultSite(url, pageData);
      if (adultResult) return cacheAndReturn(adultResult);
    }

    // New platform extractors
    if (isPinterest(url)) {
      const pinResult = await tryPinterest(url, pageData);
      if (pinResult) return cacheAndReturn(pinResult);
    }

    if (isLoom(url)) {
      const loomResult = await tryLoom(url, pageData);
      if (loomResult) return cacheAndReturn(loomResult);
    }

    if (isWistia(url)) {
      const wistResult = await tryWistia(url, pageData);
      if (wistResult) return cacheAndReturn(wistResult);
    }

    if (isBrightcove(url) || isJWPlayer(url)) {
      const embedResult = await tryEmbedPlayer(url, pageData);
      if (embedResult) return cacheAndReturn(embedResult);
    }

    if (isVidyard(url)) {
      const vyResult = await tryVidyard(url, pageData);
      if (vyResult) return cacheAndReturn(vyResult);
    }

    if (isBitchute(url)) {
      const bcResult = await tryBitchute(url, pageData);
      if (bcResult) return cacheAndReturn(bcResult);
    }

    if (isOdysee(url)) {
      const odResult = await tryOdysee(url, pageData);
      if (odResult) return cacheAndReturn(odResult);
    }

    if (isKick(url)) {
      const kickResult = await tryKick(url, pageData);
      if (kickResult) return cacheAndReturn(kickResult);
    }

    if (is9GAG(url)) {
      const gagResult = await try9GAG(url, pageData);
      if (gagResult) return cacheAndReturn(gagResult);
    }

    if (isImgur(url)) {
      const imgResult = await tryImgur(url, pageData);
      if (imgResult) return cacheAndReturn(imgResult);
    }

    if (isCoub(url)) {
      const coubResult = await tryCoub(url, pageData);
      if (coubResult) return cacheAndReturn(coubResult);
    }

    if (isVK(url)) {
      const vkResult = await tryVK(url, pageData);
      if (vkResult) return cacheAndReturn(vkResult);
    }

    if (isRutube(url)) {
      const rtResult = await tryRutube(url, pageData);
      if (rtResult) return cacheAndReturn(rtResult);
    }

    if (isPeerTube(url)) {
      const ptResult = await tryPeerTube(url, pageData);
      if (ptResult) return cacheAndReturn(ptResult);
    }

    // Deep iframe scraping for unknown sites
    const deepResult = await tryDeepIframeScrape(url, pageData);
    if (deepResult) return cacheAndReturn(deepResult);

    // Filter and verify scraped sources
    const sourceCandidates = filterAdSources(mergeUniqueSources(
      pageData.videoSources,
      pageData.metadata.videoUrl ? [{ url: pageData.metadata.videoUrl }] : [],
    ));

    if (sourceCandidates.length > 0) {
      const verified = sortSourcesByQuality(await verifyVideoSources(sourceCandidates, url));
      if (verified.length > 0) {
        return cacheAndReturn({
          success: true,
          type: verified.length === 1 ? 'direct' : 'picker',
          url: verified.length === 1 ? verified[0].url : undefined,
          filename: verified.length === 1 ? generateFilename(pageData.metadata.title, verified[0]) : undefined,
          picker: verified.length > 1 ? verified.map((s) => ({
            type: 'video', url: s.url, thumb: pageData.metadata.thumbnail,
            quality: s.quality, format: s.format, size: s.size,
          })) : undefined,
          metadata: pageData.metadata,
          videoSources: verified,
        });
      }

      return cacheAndReturn({
        success: true,
        type: 'metadata_only',
        metadata: pageData.metadata,
        videoSources: sourceCandidates,
      });
    }

    return cacheAndReturn({
      success: true,
      type: 'metadata_only',
      metadata: pageData.metadata,
      videoSources: [],
    });

  } catch (error) {
    console.error('Error processing video:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Failed to process video' }, 500);
  }
});

// ── Helpers ──

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isYouTube(url: string): boolean { return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url); }
function isTikTok(url: string): boolean { return /(?:tiktok\.com|vm\.tiktok\.com)/i.test(url); }
function isTwitter(url: string): boolean { return /(?:twitter\.com|x\.com)\/\w+\/status/i.test(url); }
function isInstagram(url: string): boolean { return /(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\//i.test(url); }
function isDailymotion(url: string): boolean { return /(?:dailymotion\.com|dai\.ly)/i.test(url); }
function isVimeo(url: string): boolean { return /vimeo\.com\/\d+/i.test(url); }
function isRumble(url: string): boolean { return /rumble\.com/i.test(url); }
function isStreamable(url: string): boolean { return /streamable\.com\//i.test(url); }
function isRedditVideo(url: string): boolean { return /(?:reddit\.com|redd\.it)/i.test(url); }
function isTwitch(url: string): boolean { return /(?:twitch\.tv|clips\.twitch\.tv)/i.test(url); }
function isBilibili(url: string): boolean { return /(?:bilibili\.com|b23\.tv)/i.test(url); }
function isOKru(url: string): boolean { return /(?:ok\.ru|odnoklassniki\.ru)/i.test(url); }
function is9anime(url: string): boolean { return /(?:9anime|gogoanime|aniwave|animesuge|zoro\.to|aniwatch|kaido\.to|animepahe)/i.test(url); }
function isAdultSite(url: string): boolean { return /(?:xvideos|pornhub|xhamster|redtube|youporn|tube8|spankbang|xnxx|eporner|tnaflix|drtuber)/i.test(url); }
function isFacebook(url: string): boolean { return /(?:facebook\.com|fb\.watch|fb\.com)\/(?:watch|reel|video|.*\/videos\/)/i.test(url); }
function isPinterest(url: string): boolean { return /(?:pinterest\.com|pin\.it)/i.test(url); }
function isLoom(url: string): boolean { return /loom\.com\/share\//i.test(url); }
function isWistia(url: string): boolean { return /(?:wistia\.com|wistia\.net|wi\.st)/i.test(url); }
function isBrightcove(url: string): boolean { return /(?:brightcove|bcove\.video|players\.brightcove)/i.test(url); }
function isJWPlayer(url: string): boolean { return /(?:jwplatform\.com|jwplayer\.com|cdn\.jwplayer)/i.test(url); }
function isVidyard(url: string): boolean { return /(?:vidyard\.com|share\.vidyard)/i.test(url); }
function isPeerTube(url: string): boolean { return /\/w\/[a-zA-Z0-9-]+|\/videos\/watch\//i.test(url) && !/youtube|vimeo|dailymotion/i.test(url); }
function isBitchute(url: string): boolean { return /bitchute\.com\/video\//i.test(url); }
function isOdysee(url: string): boolean { return /(?:odysee\.com|lbry\.tv)/i.test(url); }
function isKick(url: string): boolean { return /kick\.com/i.test(url); }
function is9GAG(url: string): boolean { return /9gag\.com\/gag\//i.test(url); }
function isImgur(url: string): boolean { return /imgur\.com\//i.test(url); }
function isCoub(url: string): boolean { return /coub\.com\/view\//i.test(url); }
function isVK(url: string): boolean { return /(?:vk\.com|vkvideo\.ru)/i.test(url); }
function isRutube(url: string): boolean { return /rutube\.ru\/video\//i.test(url); }
function isDirectVideoUrl(url: string): boolean { return /\.(?:mp4|webm|mov|m4v|avi|mkv|flv|m3u8|mpd|ts)(?:\?|$)/i.test(url); }

function generateFilename(title: string, source: VideoSource): string {
  const safeName = (title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
  const ext = source.format || 'mp4';
  const quality = source.quality ? `_${source.quality}` : '';
  return `${safeName}${quality}.${ext}`;
}

interface VideoSource {
  url: string;
  quality?: string;
  format?: string;
  size?: string;
  type?: string;
}

// ── Ad / tracking URL filter ──

const AD_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'facebook.net', 'fbcdn.net/ads', 'adsserver.', 'adservice.',
  'ads.', 'ad.', 'adtech.', 'adnxs.com', 'adsrvr.org', 'amazon-adsystem.com',
  'moatads.com', 'serving-sys.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'criteo.com', 'taboola.com', 'outbrain.com',
  'bidswitch.net', 'smartadserver.com', 'indexexchange.com', 'sharethrough.com',
  'spotxchange.com', 'springserve.com', 'yieldmo.com', 'undertone.com',
  'teads.tv', 'tremorhub.com', 'unrulymedia.com', 'videologygroup.com',
  'chartbeat.com', 'hotjar.com', 'mixpanel.com', 'segment.com', 'amplitude.com',
  'newrelic.com', 'pingdom.com', 'sentry.io', 'bugsnag.com',
  'pixel.', 'track.', 'tracking.', 'beacon.', 'analytics.',
  'imasdk.googleapis.com', 'securepubads.g.doubleclick.net',
  'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
  'static.ads-twitter.com', 'syndication.twitter.com',
  'connect.facebook.net', 'an.facebook.com',
  'ads-api.twitter.com', 'analytics.twitter.com',
  'tealiumiq.com', 'cdn.taboola.com', 'cdn.outbrain.com',
  'connatix.com', 'jwpltx.com', 'aniview.com', 'innovid.com',
  'freewheel.tv', 'adaptv.advertising.com', 'adcolony.com',
  'mopub.com', 'inmobi.com', 'vungle.com', 'applovin.com',
  'smaato.net', 'startapp.com', 'fyber.com', 'ironsource.com',
  'chartboost.com', 'tapjoy.com', 'unity3d.com/ads',
  'prebid.org', 'sovrn.com', 'gumgum.com', 'triplelift.com',
  'nativo.com', 'stackadapt.com', 'mediamath.com',
  'thetradedesk.com', 'liveramp.com', 'lotame.com',
  'bluekai.com', 'eyeota.com', 'oracle.com/cx/advertising',
];

const AD_PATH_PATTERNS = [
  /\/ads?\//i, /\/preroll/i, /\/midroll/i, /\/postroll/i,
  /\/vast\//i, /\/vpaid\//i, /\/ima\//i, /\/adserver/i,
  /\/pixel\//i, /\/track(?:ing)?\//i, /\/beacon\//i,
  /\/sponsor/i, /\/promo(?:tion)?\//i, /commercial/i,
  /interstitial/i, /overlay_ad/i, /bumper_ad/i,
];

function isAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  for (const domain of AD_DOMAINS) {
    if (lower.includes(domain)) return true;
  }
  for (const pattern of AD_PATH_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  // Very short video files are usually tracking pixels
  if (/\.(?:gif|png|jpg|jpeg|svg|ico)(?:\?|$)/i.test(lower)) return true;
  // 1x1 pixel trackers
  if (/width=["']?1["']?\s+height=["']?1["']?/i.test(lower)) return true;
  return false;
}

function filterAdSources(sources: VideoSource[]): VideoSource[] {
  return sources.filter(s => !isAdUrl(s.url));
}

function mergeUniqueSources(...groups: VideoSource[][]): VideoSource[] {
  const merged: VideoSource[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const source of group) {
      if (!source?.url) continue;
      const normalized = normalizeExtractedUrl(source.url);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push({ ...source, url: normalized });
    }
  }

  return merged;
}

// ── Cobalt (multiple instances) ──

const COBALT_INSTANCES = [
  'https://api.cobalt.tools/',
  'https://cobalt-api.kwiatekmiki.com/',
  'https://cobalt.canine.tools/',
];

async function tryCobaltMulti(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  for (const instance of COBALT_INSTANCES) {
    try {
      const res = await fetch(instance, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, downloadMode: 'auto', filenameStyle: 'pretty', videoQuality: 'max' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      console.log('Cobalt status from', instance, ':', data.status);

      if (data.status === 'picker') {
        return { success: true, type: 'picker', audio: data.audio, picker: data.picker, metadata: pageData.metadata, videoSources: pageData.videoSources };
      }
      if (data.status === 'redirect' || data.status === 'tunnel') {
        return { success: true, type: 'direct', url: data.url, filename: data.filename, metadata: pageData.metadata, videoSources: pageData.videoSources };
      }
    } catch (e) {
      console.log('Cobalt instance', instance, 'failed:', e);
    }
  }
  return null;
}

// ── Invidious (YouTube) ──

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://invidious.protokolla.fi',
];

async function tryInvidious(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats,title,videoThumbnails,lengthSeconds,author`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();

      const sources: VideoSource[] = [];
      for (const f of data.formatStreams || []) {
        if (f.url) sources.push({ url: f.url, quality: f.qualityLabel || f.quality, format: f.container || 'mp4', type: 'combined' });
      }
      for (const f of data.adaptiveFormats || []) {
        if (f.url && f.type?.startsWith('video/')) {
          sources.push({ url: f.url, quality: f.qualityLabel || f.quality, format: f.container || 'mp4', type: 'video' });
        }
      }

      if (sources.length > 0) {
        const thumb = data.videoThumbnails?.find((t: any) => t.quality === 'maxresdefault')?.url || data.videoThumbnails?.[0]?.url || pageData.metadata.thumbnail;
        const meta = { ...pageData.metadata, title: data.title || pageData.metadata.title, thumbnail: thumb, author: data.author || pageData.metadata.author, duration: data.lengthSeconds?.toString() || pageData.metadata.duration };
        return buildPickerResult(sources, meta);
      }
    } catch { continue; }
  }
  return null;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Piped (YouTube fallback) ──

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.in.projectsegfau.lt',
];

async function tryPiped(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();

      const sources: VideoSource[] = [];
      for (const s of data.videoStreams || []) {
        if (s.url && s.videoOnly === false) {
          sources.push({ url: s.url, quality: s.quality, format: s.format?.split('/')[1] || 'mp4', type: 'combined' });
        }
      }
      for (const s of data.videoStreams || []) {
        if (s.url && s.videoOnly === true) {
          sources.push({ url: s.url, quality: s.quality, format: s.format?.split('/')[1] || 'webm', type: 'video' });
        }
      }

      if (sources.length > 0) {
        const meta = {
          ...pageData.metadata,
          title: data.title || pageData.metadata.title,
          thumbnail: data.thumbnailUrl || pageData.metadata.thumbnail,
          author: data.uploader || pageData.metadata.author,
          duration: data.duration?.toString() || pageData.metadata.duration,
        };
        return buildPickerResult(sources, meta);
      }
    } catch { continue; }
  }
  return null;
}

// ── TikTok extraction ──

async function tryTikTok(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: tikwm.com
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        const d = json.data;
        const sources: VideoSource[] = [];
        if (d.play) sources.push({ url: d.play, quality: 'HD (no watermark)', format: 'mp4', type: 'combined' });
        if (d.hdplay) sources.push({ url: d.hdplay, quality: 'HD+', format: 'mp4', type: 'combined' });
        if (d.wmplay) sources.push({ url: d.wmplay, quality: 'Watermarked', format: 'mp4', type: 'combined' });
        if (d.music) sources.push({ url: d.music, quality: 'Audio', format: 'mp3', type: 'audio' });

        if (sources.length > 0) {
          const meta = {
            ...pageData.metadata,
            title: d.title || pageData.metadata.title,
            thumbnail: d.cover || d.origin_cover || pageData.metadata.thumbnail,
            author: d.author?.nickname || d.author?.unique_id || pageData.metadata.author,
            duration: d.duration?.toString() || pageData.metadata.duration,
          };
          return buildPickerResult(sources, meta);
        }
      }
    }
  } catch (e) { console.log('tikwm failed:', e); }

  // Strategy 2: tikcdn.io
  try {
    const res = await fetch('https://tikcdn.io/ssstik/' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('video')) {
      return {
        success: true, type: 'direct', url: res.url,
        filename: generateFilename(pageData.metadata.title, { url: res.url, format: 'mp4' }),
        metadata: pageData.metadata,
        videoSources: [{ url: res.url, quality: 'SD', format: 'mp4', type: 'combined' }],
      };
    }
  } catch (e) { console.log('tikcdn failed:', e); }

  // Strategy 3: Mobile TikTok scrape
  try {
    const mobileUrl = url.replace('www.tiktok.com', 'm.tiktok.com');
    const res = await fetch(mobileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15', 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    const ssrMatch = html.match(/window\['SIGI_STATE'\]\s*=\s*(\{[\s\S]*?\});/);
    const rehydrateMatch = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    const blob = ssrMatch?.[1] || rehydrateMatch?.[1] || '';

    if (blob) {
      const videoUrls: string[] = [];
      const urlPattern = /https?:\/\/[^"'\s\\]+\.(?:mp4|webm)(?:\?[^"'\s\\]*)?/g;
      let match;
      while ((match = urlPattern.exec(blob)) !== null) videoUrls.push(normalizeExtractedUrl(match[0]));

      const addrPattern = /["'](?:playAddr|downloadAddr|play_addr(?:_lowbr)?|download_addr)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
      while ((match = addrPattern.exec(blob)) !== null) videoUrls.push(normalizeExtractedUrl(match[1]));

      const unique = [...new Set(videoUrls)].filter(u => u.startsWith('http') && !isAdUrl(u));
      if (unique.length > 0) {
        const sources = unique.map(u => ({ url: u, quality: 'Direct', format: 'mp4', type: 'combined' as const }));
        return buildPickerResult(sources, pageData.metadata);
      }
    }
  } catch (e) { console.log('TikTok mobile scrape failed:', e); }

  return null;
}

// ── Twitter/X extraction ──

async function tryTwitter(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const tweetMatch = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i);
  if (!tweetMatch) return null;
  const [, user, tweetId] = tweetMatch;

  // Strategy 1: fxtwitter API
  try {
    const fxRes = await fetch(`https://api.fxtwitter.com/${user}/status/${tweetId}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      const tweet = fxData.tweet;
      if (tweet?.media?.videos?.length > 0) {
        const sources: VideoSource[] = [];
        for (const vid of tweet.media.videos) {
          if (vid.url) sources.push({ url: vid.url, quality: vid.height ? `${vid.height}p` : 'HD', format: 'mp4', type: 'combined' });
          if (vid.variants) {
            for (const v of vid.variants) {
              if (v.url && v.content_type?.includes('video')) {
                sources.push({ url: v.url, quality: v.bitrate ? `${Math.round(v.bitrate / 1000)}kbps` : 'Direct', format: 'mp4', type: 'combined' });
              }
            }
          }
        }
        if (sources.length > 0) {
          const meta = {
            ...pageData.metadata,
            title: tweet.text?.slice(0, 100) || pageData.metadata.title,
            author: tweet.author?.name || user,
            thumbnail: tweet.media?.photos?.[0]?.url || tweet.media?.videos?.[0]?.thumbnail_url || pageData.metadata.thumbnail,
            siteName: 'Twitter / X',
          };
          return buildPickerResult(sources, meta);
        }
      }
    }
  } catch (e) { console.log('fxtwitter failed:', e); }

  // Strategy 2: vxtwitter API
  try {
    const vxUrl = `https://api.vxtwitter.com/${user}/status/${tweetId}`;
    const res = await fetch(vxUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.media_extended) {
        const sources: VideoSource[] = [];
        for (const media of data.media_extended) {
          if (media.type === 'video' && media.url) {
            sources.push({ url: media.url, quality: media.height ? `${media.height}p` : 'HD', format: 'mp4', type: 'combined' });
          }
        }
        if (sources.length > 0) {
          const meta = {
            ...pageData.metadata,
            title: data.text?.slice(0, 100) || pageData.metadata.title,
            author: data.user_name || user,
            thumbnail: data.media_extended?.[0]?.thumbnail_url || pageData.metadata.thumbnail,
            siteName: 'Twitter / X',
          };
          return buildPickerResult(sources, meta);
        }
      }
    }
  } catch (e) { console.log('vxtwitter failed:', e); }

  // Strategy 3: Nitter instances
  const nitterInstances = ['https://nitter.privacydev.net', 'https://nitter.poast.org', 'https://nitter.cz'];
  for (const instance of nitterInstances) {
    try {
      const nitterUrl = `${instance}/${user}/status/${tweetId}`;
      const res = await fetch(nitterUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const sources: VideoSource[] = [];

      const srcRegex = /<source[^>]*src=["']([^"']+)["'][^>]*type=["']video\/([^"']+)["']/gi;
      let m;
      while ((m = srcRegex.exec(html)) !== null) {
        let videoUrl = m[1];
        if (videoUrl.startsWith('/')) videoUrl = `${instance}${videoUrl}`;
        sources.push({ url: videoUrl, quality: 'Direct', format: m[2] || 'mp4', type: 'combined' });
      }

      const videoSrc = html.match(/<video[^>]*src=["']([^"']+)["']/i);
      if (videoSrc) {
        let vUrl = videoSrc[1];
        if (vUrl.startsWith('/')) vUrl = `${instance}${vUrl}`;
        sources.push({ url: vUrl, quality: 'Direct', format: 'mp4', type: 'combined' });
      }

      if (sources.length > 0) {
        const meta = { ...pageData.metadata, author: user, siteName: 'Twitter / X' };
        return buildPickerResult(sources, meta);
      }
    } catch { continue; }
  }

  return null;
}

// ── Instagram extraction ──

async function tryInstagram(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: ddinstagram
  try {
    const igUrl = url.replace(/(?:www\.)?instagram\.com/, 'ddinstagram.com');
    const res = await fetch(igUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const html = await res.text();
      const sources: VideoSource[] = [];
      const ogVideo = html.match(/<meta[^>]*property=["']og:video(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i);
      if (ogVideo) sources.push({ url: normalizeExtractedUrl(ogVideo[1]), quality: 'HD', format: 'mp4', type: 'combined' });
      const videoRegex = /["'](https?:\/\/[^"'\s]+(?:cdninstagram\.com|fbcdn\.net)[^"'\s]*\.mp4[^"'\s]*)["']/gi;
      let m;
      while ((m = videoRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
      if (sources.length > 0) {
        const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
        const ogThumb = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
        const meta = { ...pageData.metadata, title: ogTitle?.[1] || pageData.metadata.title, thumbnail: ogThumb?.[1] || pageData.metadata.thumbnail, siteName: 'Instagram' };
        return buildPickerResult(mergeUniqueSources(sources), meta);
      }
    }
  } catch (e) { console.log('ddinstagram failed:', e); }

  // Strategy 2: imginn
  try {
    const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortcode) {
      const res = await fetch(`https://imginn.com/p/${shortcode}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];
        const videoSrcRegex = /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)["']/gi;
        let m;
        while ((m = videoSrcRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
        const dataVideoRegex = /data-video=["'](https?:\/\/[^"']+)["']/gi;
        while ((m = dataVideoRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
        if (sources.length > 0) return buildPickerResult(mergeUniqueSources(sources), { ...pageData.metadata, siteName: 'Instagram' });
      }
    }
  } catch (e) { console.log('imginn failed:', e); }

  // Strategy 3: Instagram embed
  try {
    const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortcode) {
      const res = await fetch(`https://www.instagram.com/p/${shortcode}/embed/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];
        const videoUrlMatch = html.match(/["']video_url["']\s*:\s*["']([^"']+)["']/i);
        if (videoUrlMatch) sources.push({ url: normalizeExtractedUrl(videoUrlMatch[1]), quality: 'HD', format: 'mp4', type: 'combined' });
        const cdnRegex = /(https?:\/\/[^"'\s\\]+(?:cdninstagram\.com|fbcdn\.net)[^"'\s\\]*)/gi;
        let m;
        while ((m = cdnRegex.exec(html)) !== null) {
          const candidate = normalizeExtractedUrl(m[1]);
          if (/\.mp4|video/i.test(candidate)) sources.push({ url: candidate, quality: 'Direct', format: 'mp4', type: 'combined' });
        }
        if (sources.length > 0) return buildPickerResult(mergeUniqueSources(sources), { ...pageData.metadata, siteName: 'Instagram' });
      }
    }
  } catch (e) { console.log('Instagram embed failed:', e); }

  return null;
}

// ── Dailymotion extraction ──

async function tryDailymotion(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i)?.[1] || url.match(/dai\.ly\/([a-zA-Z0-9]+)/i)?.[1];
  if (!videoId) return null;

  try {
    // Use Dailymotion's oEmbed + player API
    const oembedRes = await fetch(`https://www.dailymotion.com/services/oembed?url=https://www.dailymotion.com/video/${videoId}&format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    
    // Also fetch the player page to extract streams
    const playerRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });

    const sources: VideoSource[] = [];
    let meta = { ...pageData.metadata, siteName: 'Dailymotion' };

    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      meta.title = oembed.title || meta.title;
      meta.author = oembed.author_name || meta.author;
      meta.thumbnail = oembed.thumbnail_url || meta.thumbnail;
    }

    if (playerRes.ok) {
      const playerData = await playerRes.json();
      const qualities = playerData.qualities;
      if (qualities) {
        for (const [quality, streams] of Object.entries(qualities)) {
          if (Array.isArray(streams)) {
            for (const stream of streams as any[]) {
              if (stream.url && stream.type?.includes('video')) {
                sources.push({ url: stream.url, quality: quality, format: stream.type?.includes('mp4') ? 'mp4' : 'hls', type: 'combined' });
              }
            }
          }
        }
      }
      // HLS manifest
      if (playerData.qualities?.auto?.[0]?.url) {
        sources.push({ url: playerData.qualities.auto[0].url, quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
      }
      meta.title = playerData.title || meta.title;
      meta.thumbnail = playerData.poster_url || meta.thumbnail;
      meta.duration = playerData.duration?.toString() || meta.duration;
    }

    if (sources.length > 0) return buildPickerResult(filterAdSources(sources), meta);
  } catch (e) { console.log('Dailymotion extraction failed:', e); }

  return null;
}

// ── Vimeo extraction ──

async function tryVimeo(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (!videoId) return null;

  try {
    // Vimeo oEmbed
    const oembedRes = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`, {
      signal: AbortSignal.timeout(8000),
    });

    let meta = { ...pageData.metadata, siteName: 'Vimeo' };
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      meta.title = oembed.title || meta.title;
      meta.author = oembed.author_name || meta.author;
      meta.thumbnail = oembed.thumbnail_url || meta.thumbnail;
      meta.duration = oembed.duration?.toString() || meta.duration;
    }

    // Try config endpoint for streams
    const configRes = await fetch(`https://player.vimeo.com/video/${videoId}/config`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://vimeo.com/' },
      signal: AbortSignal.timeout(8000),
    });

    if (configRes.ok) {
      const config = await configRes.json();
      const sources: VideoSource[] = [];

      // Progressive downloads
      const progressive = config.request?.files?.progressive;
      if (Array.isArray(progressive)) {
        for (const p of progressive) {
          if (p.url) sources.push({ url: p.url, quality: p.quality || `${p.height}p`, format: 'mp4', type: 'combined', size: p.size ? formatBytes(p.size) : undefined });
        }
      }

      // HLS
      const hls = config.request?.files?.hls?.cdns;
      if (hls) {
        for (const [, cdn] of Object.entries(hls) as any) {
          if (cdn.url) sources.push({ url: cdn.url, quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
        }
      }

      // DASH
      const dash = config.request?.files?.dash?.cdns;
      if (dash) {
        for (const [, cdn] of Object.entries(dash) as any) {
          if (cdn.url) sources.push({ url: cdn.url, quality: 'Auto (DASH)', format: 'dash', type: 'combined' });
        }
      }

      meta.thumbnail = config.video?.thumbs?.base || meta.thumbnail;
      meta.title = config.video?.title || meta.title;

      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Vimeo extraction failed:', e); }

  return null;
}

// ── Rumble extraction ──

async function tryRumble(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const sources: VideoSource[] = [];

    // Rumble embeds video URLs in JSON within script tags
    const embedPattern = /(?:embedUrl|videoUrl|mp4Url|hlsUrl)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
    let m;
    while ((m = embedPattern.exec(html)) !== null) {
      sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: guessFormat('', m[1]), type: 'combined' });
    }

    // Look in JSON-LD
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = jsonLdRegex.exec(html)) !== null) {
      try {
        const obj = JSON.parse(m[1]);
        if (obj.contentUrl) sources.push({ url: obj.contentUrl, quality: 'HD', format: 'mp4', type: 'combined' });
        if (obj.embedUrl) sources.push({ url: obj.embedUrl, quality: 'Embed', format: 'mp4', type: 'combined' });
      } catch {}
    }

    // Direct mp4 links
    const directRegex = /["'](https?:\/\/[^"'\s]+rumble\.com[^"'\s]*\.mp4[^"'\s]*)["']/gi;
    while ((m = directRegex.exec(html)) !== null) {
      sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
    }

    const meta = extractMetadata(html, url);
    meta.siteName = 'Rumble';

    if (sources.length > 0) return buildPickerResult(filterAdSources(mergeUniqueSources(sources)), meta);
  } catch (e) { console.log('Rumble extraction failed:', e); }

  return null;
}

// ── Streamable extraction ──

async function tryStreamable(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/streamable\.com\/([a-zA-Z0-9]+)/)?.[1];
  if (!videoId) return null;

  try {
    // Streamable has an open API
    const res = await fetch(`https://api.streamable.com/videos/${videoId}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const sources: VideoSource[] = [];
      const files = data.files;
      if (files) {
        for (const [quality, file] of Object.entries(files) as any) {
          if (file?.url) {
            const videoUrl = file.url.startsWith('//') ? `https:${file.url}` : file.url;
            sources.push({ url: videoUrl, quality: quality, format: 'mp4', type: 'combined', size: file.size ? formatBytes(file.size) : undefined });
          }
        }
      }
      const meta = {
        ...pageData.metadata,
        title: data.title || pageData.metadata.title,
        thumbnail: data.thumbnail_url ? (data.thumbnail_url.startsWith('//') ? `https:${data.thumbnail_url}` : data.thumbnail_url) : pageData.metadata.thumbnail,
        siteName: 'Streamable',
      };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Streamable extraction failed:', e); }

  return null;
}

// ── Reddit extraction ──

async function tryReddit(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    // Reddit JSON API
    const jsonUrl = url.replace(/\/?$/, '.json');
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    const sources: VideoSource[] = [];

    // Direct reddit video
    if (post.is_video && post.media?.reddit_video) {
      const rv = post.media.reddit_video;
      if (rv.fallback_url) sources.push({ url: rv.fallback_url, quality: `${rv.height || 720}p`, format: 'mp4', type: 'video' });
      if (rv.hls_url) sources.push({ url: rv.hls_url, quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
      if (rv.dash_url) sources.push({ url: rv.dash_url, quality: 'Auto (DASH)', format: 'dash', type: 'combined' });
    }

    // Crossposted video
    if (post.crosspost_parent_list?.length > 0) {
      const cp = post.crosspost_parent_list[0];
      if (cp.media?.reddit_video?.fallback_url) {
        sources.push({ url: cp.media.reddit_video.fallback_url, quality: `${cp.media.reddit_video.height || 720}p`, format: 'mp4', type: 'video' });
      }
    }

    const meta = {
      ...pageData.metadata,
      title: post.title || pageData.metadata.title,
      thumbnail: post.thumbnail && post.thumbnail !== 'self' ? post.thumbnail : pageData.metadata.thumbnail,
      author: post.author || pageData.metadata.author,
      siteName: 'Reddit',
    };

    if (sources.length > 0) return buildPickerResult(sources, meta);
  } catch (e) { console.log('Reddit extraction failed:', e); }

  return null;
}

// ── Twitch extraction ──

async function tryTwitch(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Twitch clips
  const clipSlug = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/i)?.[1] 
    || url.match(/twitch\.tv\/\w+\/clip\/([A-Za-z0-9_-]+)/i)?.[1];
  
  if (clipSlug) {
    // Try clips.twitch.tv direct page scrape
    try {
      const res = await fetch(`https://clips.twitch.tv/${clipSlug}`, {
        headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];
        
        // Extract from clip data in page
        const qualityOptions = html.match(/"quality_options"\s*:\s*(\[[\s\S]*?\])/);
        if (qualityOptions) {
          try {
            const opts = JSON.parse(qualityOptions[1]);
            for (const opt of opts) {
              if (opt.source) sources.push({ url: opt.source, quality: opt.quality || 'HD', format: 'mp4', type: 'combined' });
            }
          } catch {}
        }
        
        // Direct mp4 from thumbnails URL pattern
        const thumbMatch = html.match(/https:\/\/clips-media-assets2\.twitch\.tv\/[^"'\s]+/g);
        if (thumbMatch) {
          for (const t of thumbMatch) {
            const mp4Url = t.replace(/-preview-\d+x\d+\.\w+$/, '.mp4');
            if (mp4Url.endsWith('.mp4')) sources.push({ url: mp4Url, quality: 'HD', format: 'mp4', type: 'combined' });
          }
        }

        // Video src from embedded player
        const videoSrc = /["'](https?:\/\/[^"'\s]+(?:\.mp4|clips-media)[^"'\s]*)["']/gi;
        let m;
        while ((m = videoSrc.exec(html)) !== null) {
          if (!isAdUrl(m[1])) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
        }

        const meta = extractMetadata(html, url);
        meta.siteName = 'Twitch';
        if (sources.length > 0) return buildPickerResult(mergeUniqueSources(sources), meta);
      }
    } catch (e) { console.log('Twitch clip scrape failed:', e); }
  }

  // Twitch VODs - try to extract from page
  try {
    const vodMatch = url.match(/twitch\.tv\/videos\/(\d+)/i);
    if (vodMatch) {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];
        
        // HLS URLs in page data
        const hlsMatch = /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/gi;
        let m;
        while ((m = hlsMatch.exec(html)) !== null) {
          if (!isAdUrl(m[1])) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
        }
        
        const meta = extractMetadata(html, url);
        meta.siteName = 'Twitch';
        if (sources.length > 0) return buildPickerResult(sources, meta);
      }
    }
  } catch (e) { console.log('Twitch VOD failed:', e); }

  return null;
}

// ── Bilibili extraction ──

async function tryBilibili(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Extract BV or av ID
  const bvMatch = url.match(/BV([A-Za-z0-9]+)/i);
  const avMatch = url.match(/av(\d+)/i);
  const bvid = bvMatch ? `BV${bvMatch[1]}` : null;
  
  // Try Bilibili API
  if (bvid) {
    try {
      // Get video info
      const infoRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: { 'User-Agent': USER_AGENTS[0], 'Referer': 'https://www.bilibili.com/' },
        signal: AbortSignal.timeout(10000),
      });
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        const videoData = infoData.data;
        if (videoData) {
          const cid = videoData.cid;
          const aid = videoData.aid;
          
          // Get playback URL
          const playRes = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16`, {
            headers: { 'User-Agent': USER_AGENTS[0], 'Referer': `https://www.bilibili.com/video/${bvid}` },
            signal: AbortSignal.timeout(10000),
          });
          
          const sources: VideoSource[] = [];
          if (playRes.ok) {
            const playData = await playRes.json();
            const d = playData.data;
            
            // DASH streams
            if (d?.dash) {
              for (const v of d.dash.video || []) {
                if (v.baseUrl || v.base_url) {
                  const quality = v.height ? `${v.height}p` : `Quality ${v.id}`;
                  sources.push({ url: v.baseUrl || v.base_url, quality, format: 'mp4', type: 'video' });
                }
              }
              for (const a of d.dash.audio || []) {
                if (a.baseUrl || a.base_url) {
                  sources.push({ url: a.baseUrl || a.base_url, quality: 'Audio', format: 'mp3', type: 'audio' });
                }
              }
            }
            
            // Direct URLs (durl)
            if (d?.durl) {
              for (const seg of d.durl) {
                if (seg.url) sources.push({ url: seg.url, quality: 'Direct', format: 'flv', type: 'combined' });
                for (const backup of seg.backup_url || []) {
                  sources.push({ url: backup, quality: 'Backup', format: 'flv', type: 'combined' });
                }
              }
            }
          }
          
          const meta = {
            ...pageData.metadata,
            title: videoData.title || pageData.metadata.title,
            description: videoData.desc || pageData.metadata.description,
            thumbnail: videoData.pic || pageData.metadata.thumbnail,
            author: videoData.owner?.name || pageData.metadata.author,
            duration: videoData.duration?.toString() || pageData.metadata.duration,
            siteName: 'Bilibili',
          };
          
          if (sources.length > 0) return buildPickerResult(sources, meta);
        }
      }
    } catch (e) { console.log('Bilibili API failed:', e); }
  }

  // Fallback: scrape page for video URLs
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Referer': 'https://www.bilibili.com/' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const sources: VideoSource[] = [];
      
      // __playinfo__ JSON blob
      const playInfoMatch = html.match(/window\.__playinfo__\s*=\s*(\{[\s\S]*?\})\s*(?:<\/script>|;\s*window)/);
      if (playInfoMatch) {
        try {
          const playInfo = JSON.parse(playInfoMatch[1]);
          const d = playInfo.data;
          if (d?.dash) {
            for (const v of d.dash.video || []) {
              if (v.baseUrl || v.base_url) sources.push({ url: v.baseUrl || v.base_url, quality: v.height ? `${v.height}p` : 'HD', format: 'mp4', type: 'video' });
            }
          }
          if (d?.durl) {
            for (const seg of d.durl) {
              if (seg.url) sources.push({ url: seg.url, quality: 'Direct', format: 'flv', type: 'combined' });
            }
          }
        } catch {}
      }
      
      const meta = extractMetadata(html, url);
      meta.siteName = 'Bilibili';
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Bilibili scrape failed:', e); }

  return null;
}

// ── OK.ru extraction ──

async function tryOKru(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];

    // OK.ru embeds video data in data-options JSON
    const dataOptionsMatch = html.match(/data-options=["'](\{[\s\S]*?\})["']/);
    if (dataOptionsMatch) {
      try {
        const options = JSON.parse(decodeHtmlEntities(dataOptionsMatch[1]));
        const metadata = options?.flashvars?.metadata;
        if (metadata) {
          const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
          const videos = metaObj?.videos;
          if (Array.isArray(videos)) {
            for (const v of videos) {
              if (v.url) sources.push({ url: v.url, quality: v.name || 'Direct', format: 'mp4', type: 'combined' });
            }
          }
          // HLS
          if (metaObj?.hlsManifestUrl) sources.push({ url: metaObj.hlsManifestUrl, quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
          if (metaObj?.hlsMasterPlaylistUrl) sources.push({ url: metaObj.hlsMasterPlaylistUrl, quality: 'Auto (HLS)', format: 'hls', type: 'combined' });
          // DASH
          if (metaObj?.dashManifestUrl) sources.push({ url: metaObj.dashManifestUrl, quality: 'Auto (DASH)', format: 'dash', type: 'combined' });
        }
      } catch (e) { console.log('OK.ru data-options parse error:', e); }
    }

    // Fallback: find video URLs in page
    const okVideoRegex = /["'](https?:\/\/[^"'\s]+(?:vk\.me|mycdn\.me|odnoklassniki)[^"'\s]*\.(?:mp4|m3u8|mpd)[^"'\s]*)["']/gi;
    let m;
    while ((m = okVideoRegex.exec(html)) !== null) {
      if (!isAdUrl(m[1])) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: guessFormat('', m[1]), type: 'combined' });
    }

    const meta = extractMetadata(html, url);
    meta.siteName = 'OK.ru';
    if (sources.length > 0) return buildPickerResult(filterAdSources(mergeUniqueSources(sources)), meta);
  } catch (e) { console.log('OK.ru extraction failed:', e); }

  return null;
}

// ── Anime site extraction ──

async function tryAnime(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];

    // Common anime player patterns
    // 1. Direct video/source tags
    const extracted = extractVideoSources(html, url);
    sources.push(...extracted);

    // 2. Player JS configs (common in anime sites)
    const playerConfigs = [
      /(?:sources|file|src)\s*[:=]\s*\[\s*\{[^}]*["'](?:file|src|url)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi,
      /(?:var|let|const)\s+\w*(?:source|video|stream|player)\w*\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8|mpd)[^"']*)["']/gi,
      /(?:data-(?:video|src|source|stream))=["'](https?:\/\/[^"']+)["']/gi,
    ];
    for (const pat of playerConfigs) {
      let m;
      while ((m = pat.exec(html)) !== null) {
        if (!isAdUrl(m[1])) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: guessFormat('', m[1]), type: 'combined' });
      }
    }

    // 3. Encrypted/encoded URLs (base64)
    const b64Regex = /atob\(["']([A-Za-z0-9+/=]{20,})["']\)/g;
    let m;
    while ((m = b64Regex.exec(html)) !== null) {
      try {
        const decoded = atob(m[1]);
        if (/^https?:\/\/.+\.(mp4|m3u8|mpd)/i.test(decoded) && !isAdUrl(decoded)) {
          sources.push({ url: decoded, quality: 'Decoded', format: guessFormat('', decoded), type: 'combined' });
        }
      } catch {}
    }

    // 4. Recursive iframe scrape for embedded players
    const iframeSrcs: string[] = [];
    const iframeRegex = /<iframe[^>]*\ssrc=["']([^"']+)["']/gi;
    while ((m = iframeRegex.exec(html)) !== null) {
      const src = m[1];
      if (!isAdUrl(src)) {
        try {
          const resolved = src.startsWith('http') ? src : new URL(src, url).href;
          iframeSrcs.push(resolved);
        } catch {}
      }
    }

    for (const iframeSrc of iframeSrcs.slice(0, 5)) {
      try {
        const iRes = await fetch(iframeSrc, {
          headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Referer': url },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (iRes.ok) {
          const iHtml = await iRes.text();
          sources.push(...extractVideoSources(iHtml, iframeSrc));
          
          // Check for nested iframes (common in anime)
          const nestedIframes: string[] = [];
          const niRegex = /<iframe[^>]*\ssrc=["']([^"']+)["']/gi;
          let nm;
          while ((nm = niRegex.exec(iHtml)) !== null) {
            if (!isAdUrl(nm[1])) {
              try { nestedIframes.push(nm[1].startsWith('http') ? nm[1] : new URL(nm[1], iframeSrc).href); } catch {}
            }
          }
          for (const nested of nestedIframes.slice(0, 3)) {
            try {
              const nRes = await fetch(nested, {
                headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Referer': iframeSrc },
                redirect: 'follow',
                signal: AbortSignal.timeout(8000),
              });
              if (nRes.ok) sources.push(...extractVideoSources(await nRes.text(), nested));
            } catch {}
          }
        }
      } catch {}
    }

    const meta = extractMetadata(html, url);
    meta.siteName = meta.siteName || 'Anime';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) {
      const verified = await verifyVideoSources(filtered, url);
      if (verified.length > 0) return buildPickerResult(verified, meta);
      return buildPickerResult(filtered, meta);
    }
  } catch (e) { console.log('Anime extraction failed:', e); }

  return null;
}

// ── Adult site extraction ──

async function tryAdultSite(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];

    // These sites typically expose video URLs in specific patterns
    // 1. html5player.setVideoUrl patterns (xvideos, xnxx)
    const setVideoPatterns = [
      /html5player\.set(?:Video(?:Url|HLS)|VideoUrlHigh|VideoUrlLow)\s*\(\s*["'](https?:\/\/[^"']+)["']\s*\)/gi,
      /setVideoUrl(?:High|Low|HLS)?\s*\(\s*["'](https?:\/\/[^"']+)["']\s*\)/gi,
    ];
    for (const pat of setVideoPatterns) {
      let m;
      while ((m = pat.exec(html)) !== null) {
        const quality = /high|hd/i.test(m[0]) ? 'HD' : /low|sd/i.test(m[0]) ? 'SD' : /hls/i.test(m[0]) ? 'Auto (HLS)' : 'Direct';
        const format = /hls/i.test(m[0]) ? 'hls' : 'mp4';
        sources.push({ url: normalizeExtractedUrl(m[1]), quality, format, type: 'combined' });
      }
    }

    // 2. flashvars / playerObjList patterns (pornhub style)
    const flashvarsMatch = html.match(/(?:var\s+)?flashvars_\d+\s*=\s*(\{[\s\S]*?\});/);
    if (flashvarsMatch) {
      try {
        const fv = JSON.parse(flashvarsMatch[1]);
        const qualityKeys = Object.keys(fv).filter(k => /quality_\d+p/.test(k));
        for (const key of qualityKeys) {
          if (fv[key]) sources.push({ url: fv[key], quality: key.replace('quality_', ''), format: 'mp4', type: 'combined' });
        }
        if (fv.mediaDefinitions && Array.isArray(fv.mediaDefinitions)) {
          for (const md of fv.mediaDefinitions) {
            if (md.videoUrl) sources.push({ url: md.videoUrl, quality: md.quality ? `${md.quality}p` : 'Auto', format: md.format || 'mp4', type: 'combined' });
          }
        }
      } catch {}
    }

    // 3. video_url patterns (generic)
    const genericPatterns = [
      /["'](?:video_url|videoUrl|mp4_url|hd_url|sd_url|file_url|download_url)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi,
      /(?:video_url|videoUrl|mp4_url|hd_url|sd_url)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    ];
    for (const pat of genericPatterns) {
      let m;
      while ((m = pat.exec(html)) !== null) {
        if (!isAdUrl(m[1])) sources.push({ url: normalizeExtractedUrl(m[1]), quality: /hd/i.test(m[0]) ? 'HD' : 'Direct', format: 'mp4', type: 'combined' });
      }
    }

    // 4. Standard extraction
    sources.push(...extractVideoSources(html, url));

    const meta = extractMetadata(html, url);
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('Adult site extraction failed:', e); }

  return null;
}



async function tryDeepIframeScrape(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Find iframes in the page and scrape them for video sources
  const iframeSrcs: string[] = [];
  const iframeRegex = /<iframe[^>]*\ssrc=["']([^"']+)["']/gi;
  let m;

  // We need the raw HTML - re-fetch if we don't have video sources yet
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    while ((m = iframeRegex.exec(html)) !== null) {
      const src = m[1];
      if (/embed|player|video/i.test(src) && !isAdUrl(src)) {
        try {
          const resolved = src.startsWith('http') ? src : new URL(src, url).href;
          iframeSrcs.push(resolved);
        } catch {}
      }
    }
  } catch { return null; }

  if (iframeSrcs.length === 0) return null;

  // Scrape each iframe (max 3 to avoid timeout)
  const allSources: VideoSource[] = [];
  for (const iframeSrc of iframeSrcs.slice(0, 3)) {
    try {
      const res = await fetch(iframeSrc, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          'Accept': 'text/html',
          'Referer': url,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      const iframeHtml = await res.text();
      const iframeSources = extractVideoSources(iframeHtml, iframeSrc);
      allSources.push(...iframeSources);
    } catch { continue; }
  }

  const filtered = filterAdSources(mergeUniqueSources(allSources));
  if (filtered.length > 0) {
    const verified = await verifyVideoSources(filtered, url);
    if (verified.length > 0) {
      return buildPickerResult(verified, pageData.metadata);
    }
  }

  return null;
}

// ── Direct video URL handler ──

async function tryDirectVideoUrl(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const headRes = await fetch(url, {
      method: 'HEAD', redirect: 'follow',
      headers: { 'User-Agent': USER_AGENTS[0] },
      signal: AbortSignal.timeout(10000),
    });
    const ct = (headRes.headers.get('content-type') || '').toLowerCase();
    const cl = headRes.headers.get('content-length');
    if (headRes.ok && (ct.includes('video') || ct.includes('octet-stream') || ct.includes('mpegurl') || ct.includes('mp4'))) {
      const format = guessFormat(ct, url);
      const filename = url.split('/').pop()?.split('?')[0] || `video.${format}`;
      return {
        success: true, type: 'direct', url: headRes.url || url,
        filename,
        metadata: { ...pageData.metadata, title: filename, siteName: new URL(url).hostname },
        videoSources: [{ url: headRes.url || url, quality: 'Direct', format, size: cl ? formatBytes(parseInt(cl)) : undefined }],
      };
    }
  } catch (e) { console.log('Direct URL check failed:', e); }
  return null;
}

// ── Facebook extraction ──

async function tryFacebook(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: mbasic.facebook.com
  try {
    const mbasicUrl = url.replace(/(?:www|m)\.facebook\.com/i, 'mbasic.facebook.com');
    const res = await fetch(mbasicUrl, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const html = await res.text();
      const sources: VideoSource[] = [];
      // Facebook embeds video URLs in specific JSON keys
      const fbKeys = ['playable_url', 'playable_url_quality_hd', 'browser_native_sd_url', 'browser_native_hd_url', 'sd_src', 'hd_src', 'sd_src_no_ratelimit', 'hd_src_no_ratelimit'];
      for (const key of fbKeys) {
        const pat = new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`, 'gi');
        let m;
        while ((m = pat.exec(html)) !== null) {
          const vidUrl = normalizeExtractedUrl(m[1]);
          if (vidUrl.startsWith('http')) {
            const isHD = /hd/i.test(key);
            sources.push({ url: vidUrl, quality: isHD ? 'HD' : 'SD', format: 'mp4', type: 'combined' });
          }
        }
      }
      sources.push(...extractVideoSources(html, mbasicUrl));
      const meta = extractMetadata(html, url);
      meta.siteName = 'Facebook';
      const filtered = filterAdSources(mergeUniqueSources(sources));
      if (filtered.length > 0) return buildPickerResult(filtered, meta);
    }
  } catch (e) { console.log('Facebook mbasic failed:', e); }

  // Strategy 2: fb.watch redirect → get final URL and scrape
  if (/fb\.watch/i.test(url)) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENTS[0] }, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const html = await res.text();
        const sources = extractVideoSources(html, res.url);
        const meta = extractMetadata(html, res.url);
        meta.siteName = 'Facebook';
        const filtered = filterAdSources(mergeUniqueSources(sources));
        if (filtered.length > 0) return buildPickerResult(filtered, meta);
      }
    } catch {}
  }

  return null;
}

// ── Pinterest extraction ──

async function tryPinterest(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // Pinterest embeds video in JSON data
    const videoListRegex = /"video_list"\s*:\s*\{([^}]+(?:\{[^}]*\})*[^}]*)\}/g;
    let m;
    while ((m = videoListRegex.exec(html)) !== null) {
      const urlMatch = /"url"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/gi;
      let u;
      while ((u = urlMatch.exec(m[0])) !== null) {
        sources.push({ url: normalizeExtractedUrl(u[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
      }
    }
    // V2 format
    const v2Regex = /"V_720P"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/gi;
    while ((m = v2Regex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: '720p', format: 'mp4' });
    const v2HlsRegex = /"V_HLSV4"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/gi;
    while ((m = v2HlsRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'HLS', format: 'hls' });
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    meta.siteName = 'Pinterest';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('Pinterest extraction failed:', e); }
  return null;
}

// ── Loom extraction ──

async function tryLoom(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/loom\.com\/share\/([a-f0-9]+)/i)?.[1];
  if (!videoId) return null;
  try {
    // Loom's transcoded URL endpoint
    const res = await fetch(`https://www.loom.com/api/campaigns/sessions/${videoId}/transcoded-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENTS[0] },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        return {
          success: true, type: 'direct', url: data.url,
          filename: generateFilename(pageData.metadata.title || 'loom-video', { url: data.url, format: 'mp4' }),
          metadata: { ...pageData.metadata, siteName: 'Loom' },
          videoSources: [{ url: data.url, quality: 'HD', format: 'mp4' }],
        };
      }
    }
  } catch {}
  // Fallback: scrape page
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0] }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      const sources = extractVideoSources(html, url);
      const meta = extractMetadata(html, url);
      meta.siteName = 'Loom';
      if (sources.length > 0) return buildPickerResult(filterAdSources(mergeUniqueSources(sources)), meta);
    }
  } catch {}
  return null;
}

// ── Wistia extraction ──

async function tryWistia(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/(?:wistia\.com|wistia\.net|wi\.st)\/(?:medias|embed\/iframe)\/([a-zA-Z0-9]+)/i)?.[1];
  if (!videoId) return null;
  try {
    const res = await fetch(`https://fast.wistia.com/embed/medias/${videoId}.json`, {
      headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const media = data.media;
      const sources: VideoSource[] = [];
      if (media?.assets) {
        for (const asset of media.assets) {
          if (asset.url && /video|mp4|webm/i.test(asset.type || asset.contentType || '')) {
            sources.push({ url: asset.url.startsWith('//') ? `https:${asset.url}` : asset.url, quality: asset.display_name || `${asset.width}x${asset.height}`, format: asset.ext || 'mp4', size: asset.size ? formatBytes(asset.size) : undefined });
          }
        }
      }
      const meta = { ...pageData.metadata, title: media?.name || pageData.metadata.title, thumbnail: media?.thumbnail?.url || pageData.metadata.thumbnail, duration: media?.duration?.toString(), siteName: 'Wistia' };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Wistia extraction failed:', e); }
  return null;
}

// ── Embed player extraction (Brightcove / JW Player) ──

async function tryEmbedPlayer(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // Brightcove account/player patterns
    const bcSourceRegex = /"sources"\s*:\s*\[([\s\S]*?)\]/g;
    let m;
    while ((m = bcSourceRegex.exec(html)) !== null) {
      const srcUrl = /"src"\s*:\s*"(https?:\/\/[^"]+)"/gi;
      let s;
      while ((s = srcUrl.exec(m[1])) !== null) {
        if (!isAdUrl(s[1])) sources.push({ url: normalizeExtractedUrl(s[1]), quality: 'Direct', format: guessFormat('', s[1]) });
      }
    }
    // JW Player setup
    const jwRegex = /jwplayer\([^)]*\)\.setup\((\{[\s\S]*?\})\)/g;
    while ((m = jwRegex.exec(html)) !== null) {
      const fileMatch = /"file"\s*:\s*"(https?:\/\/[^"]+)"/gi;
      let f;
      while ((f = fileMatch.exec(m[1])) !== null) {
        sources.push({ url: normalizeExtractedUrl(f[1]), quality: 'Direct', format: guessFormat('', f[1]) });
      }
    }
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('Embed player extraction failed:', e); }
  return null;
}

// ── Vidyard extraction ──

async function tryVidyard(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/(?:vidyard\.com|share\.vidyard\.com)\/(?:watch\/)?([a-zA-Z0-9]+)/i)?.[1];
  if (!videoId) return null;
  try {
    const res = await fetch(`https://play.vidyard.com/player/${videoId}.json`, {
      headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const sources: VideoSource[] = [];
      const chapters = data.payload?.chapters || data.payload?.vyContext?.chapterAttributes || [];
      for (const ch of chapters) {
        const versions = ch.video_files || [];
        for (const v of versions) {
          if (v.url) sources.push({ url: v.url, quality: v.profile || 'Direct', format: 'mp4' });
        }
      }
      const meta = { ...pageData.metadata, title: data.payload?.vyContext?.name || pageData.metadata.title, siteName: 'Vidyard' };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Vidyard extraction failed:', e); }
  return null;
}

// ── Bitchute extraction ──

async function tryBitchute(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // Bitchute uses <source> tags and sometimes JS-set URLs
    const srcRegex = /["'](https?:\/\/[^"'\s]*(?:seed\d*\.bitchute\.com|bitchute)[^"'\s]*\.mp4[^"'\s]*)["']/gi;
    let m;
    while ((m = srcRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4' });
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    meta.siteName = 'Bitchute';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('Bitchute extraction failed:', e); }
  return null;
}

// ── Odysee / LBRY extraction ──

async function tryOdysee(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // Odysee embeds stream URLs in JSON
    const streamRegex = /"streaming_url"\s*:\s*"(https?:\/\/[^"]+)"/gi;
    let m;
    while ((m = streamRegex.exec(html)) !== null) sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: guessFormat('', m[1]) });
    // contentUrl in JSON-LD
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    meta.siteName = 'Odysee';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('Odysee extraction failed:', e); }
  return null;
}

// ── Kick extraction ──

async function tryKick(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Kick clips
  const clipMatch = url.match(/kick\.com\/[^/]+\/clips\/([^/?]+)/i) || url.match(/kick\.com\/[^/]+\?clip=([^&]+)/i);
  if (clipMatch) {
    try {
      const res = await fetch(`https://kick.com/api/v2/clips/${clipMatch[1]}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENTS[0] },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const clip = data.clip || data;
        if (clip.video_url || clip.clip_url) {
          const vidUrl = clip.video_url || clip.clip_url;
          return {
            success: true, type: 'direct', url: vidUrl,
            filename: generateFilename(clip.title || 'kick-clip', { url: vidUrl, format: 'mp4' }),
            metadata: { ...pageData.metadata, title: clip.title || 'Kick Clip', thumbnail: clip.thumbnail_url || '', siteName: 'Kick', author: clip.channel?.slug || '' },
            videoSources: [{ url: vidUrl, quality: 'HD', format: 'mp4' }],
          };
        }
      }
    } catch {}
  }
  // Fallback: scrape page
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0] }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      const sources = extractVideoSources(html, url);
      const meta = extractMetadata(html, url);
      meta.siteName = 'Kick';
      if (sources.length > 0) return buildPickerResult(filterAdSources(mergeUniqueSources(sources)), meta);
    }
  } catch {}
  return null;
}

// ── 9GAG extraction ──

async function try9GAG(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const gagId = url.match(/9gag\.com\/gag\/([a-zA-Z0-9]+)/i)?.[1];
  if (!gagId) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // 9GAG uses JSON data in page
    const jsonMatch = html.match(/window\._config\s*=\s*JSON\.parse\("([\s\S]*?)"\)/);
    if (jsonMatch) {
      try {
        const decoded = jsonMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const mp4Regex = /https?:\/\/[^"\\]+\.mp4[^"\\]*/gi;
        let m;
        while ((m = mp4Regex.exec(decoded)) !== null) sources.push({ url: normalizeExtractedUrl(m[0]), quality: 'Direct', format: 'mp4' });
      } catch {}
    }
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    meta.siteName = '9GAG';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('9GAG extraction failed:', e); }
  return null;
}

// ── Imgur extraction ──

async function tryImgur(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const imgurId = url.match(/imgur\.com\/(?:a\/)?([a-zA-Z0-9]+)/i)?.[1];
  if (!imgurId) return null;
  try {
    // Try direct .mp4 URL
    const mp4Url = `https://i.imgur.com/${imgurId}.mp4`;
    const headRes = await fetch(mp4Url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (headRes.ok && (headRes.headers.get('content-type') || '').includes('video')) {
      const cl = headRes.headers.get('content-length');
      return {
        success: true, type: 'direct', url: mp4Url,
        filename: `imgur_${imgurId}.mp4`,
        metadata: { ...pageData.metadata, siteName: 'Imgur' },
        videoSources: [{ url: mp4Url, quality: 'Direct', format: 'mp4', size: cl ? formatBytes(parseInt(cl)) : undefined }],
      };
    }
  } catch {}
  // Fallback: scrape page
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0] }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      const sources = extractVideoSources(html, url);
      const meta = extractMetadata(html, url);
      meta.siteName = 'Imgur';
      if (sources.length > 0) return buildPickerResult(filterAdSources(mergeUniqueSources(sources)), meta);
    }
  } catch {}
  return null;
}

// ── Coub extraction ──

async function tryCoub(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const coubId = url.match(/coub\.com\/view\/([a-zA-Z0-9]+)/i)?.[1];
  if (!coubId) return null;
  try {
    const res = await fetch(`https://coub.com/api/v2/coubs/${coubId}`, {
      headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const sources: VideoSource[] = [];
      const fv = data.file_versions?.html5?.video;
      if (fv) {
        if (fv.higher?.url) sources.push({ url: fv.higher.url, quality: 'High', format: 'mp4' });
        if (fv.med?.url) sources.push({ url: fv.med.url, quality: 'Medium', format: 'mp4' });
        if (fv.low?.url) sources.push({ url: fv.low.url, quality: 'Low', format: 'mp4' });
      }
      const meta = { ...pageData.metadata, title: data.title || 'Coub', thumbnail: data.picture || '', siteName: 'Coub', author: data.channel?.title || '' };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Coub extraction failed:', e); }
  return null;
}

// ── VK extraction ──

async function tryVK(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const html = await res.text();
    const sources: VideoSource[] = [];
    // VK video URLs in various JSON patterns
    const vkUrlPatterns = [
      /"url(\d+)"\s*:\s*"(https?:\/\/[^"]+)"/gi,
      /"cache(\d+)"\s*:\s*"(https?:\/\/[^"]+)"/gi,
      /"hls"\s*:\s*"(https?:\/\/[^"]+)"/gi,
      /"dash_sep"\s*:\s*"(https?:\/\/[^"]+)"/gi,
      /"live_mp4"\s*:\s*"(https?:\/\/[^"]+)"/gi,
    ];
    for (const pat of vkUrlPatterns) {
      let m;
      while ((m = pat.exec(html)) !== null) {
        const vidUrl = normalizeExtractedUrl(m[m.length - 1]);
        const quality = m.length === 3 ? `${m[1]}p` : 'Direct';
        sources.push({ url: vidUrl, quality, format: guessFormat('', vidUrl) });
      }
    }
    sources.push(...extractVideoSources(html, url));
    const meta = extractMetadata(html, url);
    meta.siteName = 'VK';
    const filtered = filterAdSources(mergeUniqueSources(sources));
    if (filtered.length > 0) return buildPickerResult(filtered, meta);
  } catch (e) { console.log('VK extraction failed:', e); }
  return null;
}

// ── Rutube extraction ──

async function tryRutube(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  const videoId = url.match(/rutube\.ru\/video\/([a-f0-9]+)/i)?.[1];
  if (!videoId) return null;
  try {
    const res = await fetch(`https://rutube.ru/api/play/options/${videoId}/?format=json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENTS[0] },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const sources: VideoSource[] = [];
      if (data.video_balancer?.m3u8) sources.push({ url: data.video_balancer.m3u8, quality: 'Auto (HLS)', format: 'hls' });
      if (data.video_balancer?.default) sources.push({ url: data.video_balancer.default, quality: 'Direct', format: 'mp4' });
      const meta = { ...pageData.metadata, title: data.title || pageData.metadata.title, thumbnail: data.thumbnail_url || pageData.metadata.thumbnail, author: data.author?.name || '', duration: data.duration?.toString() || '', siteName: 'Rutube' };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('Rutube extraction failed:', e); }
  return null;
}

// ── PeerTube extraction ──

async function tryPeerTube(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // PeerTube uses /api/v1/videos/{id} pattern
  const videoMatch = url.match(/\/(?:w|videos\/watch)\/([a-zA-Z0-9-]+)/i);
  if (!videoMatch) return null;
  try {
    const baseUrl = new URL(url).origin;
    const res = await fetch(`${baseUrl}/api/v1/videos/${videoMatch[1]}`, {
      headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const sources: VideoSource[] = [];
      if (data.files) {
        for (const f of data.files) {
          if (f.fileUrl || f.fileDownloadUrl) sources.push({ url: f.fileUrl || f.fileDownloadUrl, quality: f.resolution?.label || 'Direct', format: 'mp4', size: f.size ? formatBytes(f.size) : undefined });
        }
      }
      if (data.streamingPlaylists) {
        for (const sp of data.streamingPlaylists) {
          if (sp.playlistUrl) sources.push({ url: sp.playlistUrl, quality: 'Auto (HLS)', format: 'hls' });
          for (const f of sp.files || []) {
            if (f.fileUrl || f.fileDownloadUrl) sources.push({ url: f.fileUrl || f.fileDownloadUrl, quality: f.resolution?.label || 'Direct', format: 'mp4', size: f.size ? formatBytes(f.size) : undefined });
          }
        }
      }
      const meta = { ...pageData.metadata, title: data.name || pageData.metadata.title, thumbnail: data.previewPath ? `${baseUrl}${data.previewPath}` : pageData.metadata.thumbnail, author: data.account?.displayName || '', duration: data.duration?.toString() || '', siteName: 'PeerTube' };
      if (sources.length > 0) return buildPickerResult(sources, meta);
    }
  } catch (e) { console.log('PeerTube extraction failed:', e); }
  return null;
}

// ── HLS Manifest Resolver ──

async function resolveHlsManifest(m3u8Url: string, referer?: string): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const res = await fetch(m3u8Url, {
      headers: {
        'User-Agent': USER_AGENTS[0],
        ...(referer ? { 'Referer': referer } : {}),
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return sources;
    const text = await res.text();
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    // Check if this is a master playlist (contains #EXT-X-STREAM-INF)
    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
        
        // Extract resolution and bandwidth
        const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        const height = resMatch ? parseInt(resMatch[2], 10) : 0;
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        
        // Next non-comment line is the URL
        let streamUrl = '';
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            streamUrl = nextLine;
            break;
          }
        }
        
        if (!streamUrl) continue;
        
        // Resolve relative URLs
        if (!streamUrl.startsWith('http')) {
          streamUrl = streamUrl.startsWith('/') 
            ? new URL(streamUrl, m3u8Url).href 
            : baseUrl + streamUrl;
        }
        
        const quality = height ? `${height}p` : (bandwidth > 2000000 ? 'HD' : 'SD');
        sources.push({
          url: streamUrl,
          quality,
          format: 'mp4',
          type: 'combined',
          size: bandwidth ? `${Math.round(bandwidth / 1000)}kbps` : undefined,
        });
      }
    } else {
      // This is a media playlist (actual segments) — return the m3u8 itself as a source
      // Try to detect quality from URL path
      const pathQuality = m3u8Url.match(/(\d{3,4})[Pp_]/)?.[1];
      sources.push({
        url: m3u8Url,
        quality: pathQuality ? `${pathQuality}p` : 'Auto',
        format: 'hls',
        type: 'combined',
      });
    }
  } catch (e) {
    console.log('HLS manifest resolution failed:', e);
  }
  return sources;
}

async function resolveAllHlsSources(sources: VideoSource[], referer?: string): Promise<VideoSource[]> {
  const resolved: VideoSource[] = [];
  
  for (const source of sources) {
    if (source.url?.match(/\.m3u8(?:\?|$)/i) || source.format === 'hls') {
      const hlsSources = await resolveHlsManifest(source.url, referer);
      if (hlsSources.length > 0) {
        resolved.push(...hlsSources);
      } else {
        resolved.push(source); // Keep original if resolution fails
      }
    } else {
      resolved.push(source);
    }
  }
  
  return resolved;
}

// ── Result builder ──

function parseQualityScore(quality?: string): number {
  if (!quality) return 0;
  const q = quality.toLowerCase();
  const resMatch = q.match(/(\d{3,4})\s*p/);
  if (resMatch) return parseInt(resMatch[1], 10);
  if (q.includes('4k') || q.includes('2160')) return 2160;
  if (q.includes('1440') || q.includes('2k')) return 1440;
  if (q.includes('1080') || q.includes('full hd') || q.includes('fullhd')) return 1080;
  if (q.includes('720') || q === 'hd' || q === 'hd+' || q.includes('hd (no watermark)')) return 720;
  if (q.includes('480') || q === 'sd') return 480;
  if (q.includes('360')) return 360;
  if (q.includes('240')) return 240;
  if (q.includes('144')) return 144;
  const brMatch = q.match(/(\d+)\s*kbps/);
  if (brMatch) return Math.min(parseInt(brMatch[1], 10) / 3, 1080);
  if (q.includes('auto') || q.includes('hls') || q.includes('adaptive')) return 500;
  if (q.includes('high') || q.includes('best')) return 720;
  if (q.includes('low') || q.includes('worst')) return 240;
  if (q.includes('direct')) return 400;
  return 300;
}

function sortSourcesByQuality(sources: VideoSource[]): VideoSource[] {
  return [...sources].sort((a, b) => {
    if (a.type === 'audio' && b.type !== 'audio') return 1;
    if (a.type !== 'audio' && b.type === 'audio') return -1;
    // Prefer MP4 over HLS when same quality
    if (a.format !== 'hls' && b.format === 'hls' && parseQualityScore(a.quality) >= parseQualityScore(b.quality)) return -1;
    if (a.format === 'hls' && b.format !== 'hls' && parseQualityScore(a.quality) <= parseQualityScore(b.quality)) return 1;
    return parseQualityScore(b.quality) - parseQualityScore(a.quality);
  });
}

async function buildPickerResult(sources: VideoSource[], metadata: Record<string, string>): Promise<Record<string, unknown>> {
  const unique = mergeUniqueSources(sources);
  // Resolve any HLS/M3U8 sources to their variant streams
  const resolved = await resolveAllHlsSources(filterAdSources(unique));
  const filtered = sortSourcesByQuality(resolved);
  if (filtered.length === 0) return { success: true, type: 'metadata_only', metadata, videoSources: [] };

  return {
    success: true,
    type: filtered.length === 1 ? 'direct' : 'picker',
    url: filtered.length === 1 ? filtered[0].url : undefined,
    filename: filtered.length === 1 ? generateFilename(metadata.title, filtered[0]) : undefined,
    picker: filtered.length > 1 ? filtered.map(s => ({
      type: s.type === 'audio' ? 'audio' : 'video',
      url: s.url, thumb: metadata.thumbnail,
      quality: s.quality, format: s.format, size: s.size,
    })) : undefined,
    metadata,
    videoSources: filtered,
  };
}

// ── Page fetching with retry / multiple user agents ──

interface PageData {
  metadata: Record<string, string>;
  videoSources: VideoSource[];
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

async function fetchPageDataWithRetry(url: string): Promise<PageData> {
  const defaultMeta: Record<string, string> = {
    title: 'Unknown', description: '', thumbnail: '', duration: '',
    siteName: new URL(url).hostname, type: 'video', videoUrl: '',
    resolution: '', author: '', keywords: '',
  };

  const candidateUrls = buildCandidatePageUrls(url);

  for (const candidateUrl of candidateUrls) {
    for (const ua of USER_AGENTS) {
      try {
        const response = await fetch(candidateUrl, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
          },
          redirect: 'follow',
        });
        const html = await response.text();
        const metadata = extractMetadata(html, candidateUrl);
        const videoSources = filterAdSources(extractVideoSources(html, candidateUrl));

        if (videoSources.length > 0 || metadata.videoUrl || metadata.title !== 'Unknown') {
          return { metadata, videoSources };
        }
      } catch { continue; }
    }
  }

  const jinaFallback = await tryJinaMirror(url);
  if (jinaFallback) return jinaFallback;

  return { metadata: defaultMeta, videoSources: [] };
}

function buildCandidatePageUrls(url: string): string[] {
  const candidates = [url];

  if (/(?:facebook\.com)/i.test(url)) {
    candidates.push(url.replace('://www.facebook.com', '://m.facebook.com'));
    candidates.push(url.replace('://www.facebook.com', '://mbasic.facebook.com'));
    const reelId = url.match(/facebook\.com\/reel\/(\d+)/i)?.[1] || url.match(/[?&]v=(\d+)/i)?.[1];
    if (reelId) {
      candidates.push(`https://m.facebook.com/watch/?v=${reelId}`);
      candidates.push(`https://mbasic.facebook.com/watch/?v=${reelId}`);
    }
  }

  // Bilibili mobile
  if (/bilibili\.com/i.test(url)) {
    candidates.push(url.replace('://www.bilibili.com', '://m.bilibili.com'));
  }

  // OK.ru mobile
  if (/ok\.ru/i.test(url)) {
    candidates.push(url.replace('://ok.ru', '://m.ok.ru'));
  }

  return [...new Set(candidates)];
}

function normalizeExtractedUrl(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\u0025/gi, '%')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u003A/gi, ':')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function tryJinaMirror(url: string): Promise<PageData | null> {
  try {
    const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, '')}`;
    const response = await fetch(jinaUrl, {
      headers: { 'User-Agent': USER_AGENTS[0] },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const body = await response.text();
    const videoSources = filterAdSources(extractVideoSources(body, url));
    const metadata = {
      title: 'Unknown', description: '', thumbnail: '', duration: '',
      siteName: new URL(url).hostname, type: 'video', videoUrl: '',
      resolution: '', author: '', keywords: '',
    };
    if (videoSources.length > 0) return { metadata, videoSources };
  } catch {}
  return null;
}

// ── Metadata extraction ──

function extractMetadata(html: string, url: string): Record<string, string> {
  const $ = cheerio.load(html);

  const getMetaContent = (property: string): string => {
    return $(`meta[property="${property}"]`).attr('content')
      || $(`meta[name="${property}"]`).attr('content')
      || '';
  };

  const titleText = $('title').first().text().trim();
  const videoUrl = getMetaContent('og:video:url') || getMetaContent('og:video:secure_url') || getMetaContent('og:video') || '';
  const width = getMetaContent('og:video:width');
  const height = getMetaContent('og:video:height');

  return {
    title: decodeHtmlEntities(getMetaContent('og:title') || titleText || 'Unknown'),
    description: decodeHtmlEntities(getMetaContent('og:description') || getMetaContent('description') || ''),
    thumbnail: normalizeExtractedUrl(getMetaContent('og:image') || ''),
    duration: getMetaContent('video:duration') || '',
    siteName: decodeHtmlEntities(getMetaContent('og:site_name') || new URL(url).hostname),
    type: getMetaContent('og:type') || 'video',
    videoUrl: normalizeExtractedUrl(videoUrl),
    resolution: width && height ? `${width}x${height}` : '',
    author: decodeHtmlEntities(getMetaContent('article:author') || getMetaContent('twitter:creator') || ''),
    keywords: decodeHtmlEntities(getMetaContent('keywords') || ''),
  };
}

// ── Video source extraction (enhanced) ──

function extractVideoSources(html: string, pageUrl: string): VideoSource[] {
  const sources: VideoSource[] = [];
  const seenUrls = new Set<string>();
  const $ = cheerio.load(html);

  const addSource = (rawUrl: string, quality?: string, format?: string) => {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.length < 10) return;
    if (isAdUrl(rawUrl)) return;
    try {
      const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, pageUrl).href;
      if (seenUrls.has(resolved)) return;
      seenUrls.add(resolved);
      sources.push({ url: resolved, quality, format });
    } catch {}
  };

  // 1. <video> tags — src, data-src, data-video-src
  $('video').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    if (src) addSource(src);
    const dataSrc = $el.attr('data-src');
    if (dataSrc) addSource(dataSrc);
    const dataVideoSrc = $el.attr('data-video-src');
    if (dataVideoSrc) addSource(dataVideoSrc);
  });

  // 2. <source> tags
  $('source').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    const type = $el.attr('type');
    const fmt = type?.split('/')[1]?.split(';')[0];
    if (src) addSource(src, undefined, fmt);
  });

  // 3. OG video meta tags (cheerio)
  $('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) addSource(content);
  });

  // 4. Twitter player stream
  const twStream = $('meta[name="twitter:player:stream"], meta[property="twitter:player:stream"]').attr('content');
  if (twStream) addSource(twStream);

  // 5. JSON-LD via cheerio
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walkJsonLd = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.contentUrl) addSource(obj.contentUrl);
        if (obj.embedUrl) addSource(obj.embedUrl);
        if (obj.url && typeof obj['@type'] === 'string' && /video/i.test(obj['@type'])) addSource(obj.url);
        if (obj.video) walkJsonLd(obj.video);
        if (Array.isArray(obj)) obj.forEach(walkJsonLd);
        if (obj['@graph']) walkJsonLd(obj['@graph']);
      };
      walkJsonLd(JSON.parse($(el).html() || ''));
    } catch {}
  });

  // 6. <iframe> embeds via cheerio
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (/\.(mp4|webm|mov|m3u8)/.test(src) || /embed|player|video/i.test(src)) {
      addSource(src);
    }
  });

  // 7. data-* attributes with video URLs via cheerio
  $('[data-video-url], [data-src], [data-url], [data-file], [data-media], [data-stream], [data-hd], [data-sd], [data-mobile]').each((_, el) => {
    const $el = $(el);
    for (const attr of ['data-video-url', 'data-src', 'data-url', 'data-file', 'data-media', 'data-stream', 'data-hd', 'data-sd', 'data-mobile']) {
      const val = $el.attr(attr);
      if (val && val.startsWith('http')) addSource(val);
    }
  });

  // ── Regex-based extraction for JS-embedded URLs (cheerio can't parse JS) ──
  let m;

  // 8. Direct video file URLs in strings
  const directLinkRegex = /["'](https?:\/\/[^"'\s<>]+\.(?:mp4|webm|mov|m4v|avi|mkv|flv|wmv|3gp|ogv)(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = directLinkRegex.exec(html)) !== null) addSource(m[1]);

  // 9. JS variable patterns
  const jsPatterns = [
    /["'](?:video[_-]?(?:url|src|file|path)|file[_-]?url|source[_-]?url|mp4[_-]?url|hls[_-]?url|dash[_-]?url|stream[_-]?url|download[_-]?url|media[_-]?url|content[_-]?url|playback[_-]?url)["']\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /(?:videoUrl|videoSrc|fileSrc|streamUrl|mp4Url|hlsUrl|downloadUrl|mediaUrl|contentUrl|playbackUrl|sourceUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /"(?:url|src|file|source|stream)":\s*"(https?:\/\/[^"]+\.(?:mp4|webm|m3u8|mpd|mov|flv)[^"]*)"/gi,
  ];
  for (const pat of jsPatterns) {
    while ((m = pat.exec(html)) !== null) addSource(m[1]);
  }

  // 10. HLS / DASH streams
  const hlsRegex = /["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = hlsRegex.exec(html)) !== null) addSource(m[1], undefined, 'hls');
  const dashRegex = /["'](https?:\/\/[^"'\s<>]+\.mpd(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = dashRegex.exec(html)) !== null) addSource(m[1], undefined, 'dash');

  // 11. SSR data blobs
  const ssrBlobRegex = /(?:window\.__[A-Z_]+__|window\.\w+Data|window\.initialProps)\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/gi;
  while ((m = ssrBlobRegex.exec(html)) !== null) {
    try {
      const blob = m[1];
      const urlsInBlob = /https?:\/\/[^"'\s<>\\]+\.(?:mp4|webm|m3u8|mov|flv)(?:\?[^"'\s<>\\]*)?/gi;
      let u;
      while ((u = urlsInBlob.exec(blob)) !== null) {
        addSource(u[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
      }
    } catch {}
  }

  // 12. Platform-specific JSON keys
  const keyedUrlPatterns = [
    'playable_url', 'playable_url_quality_hd',
    'browser_native_sd_url', 'browser_native_hd_url',
    'sd_src', 'hd_src', 'sd_src_no_ratelimit', 'hd_src_no_ratelimit',
    'video_url', 'video_playback_url',
  ];
  for (const key of keyedUrlPatterns) {
    const pattern = new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`, 'gi');
    while ((m = pattern.exec(html)) !== null) {
      const candidate = normalizeExtractedUrl(m[1]);
      if (candidate.startsWith('http')) addSource(candidate);
    }
  }

  // 13. Escaped CDN links
  const escapedCdnRegex = /(https?:\\\\\/\\\\\/[^"'\\]+(?:fbcdn\.net|cdninstagram\.com|twimg\.com)[^"']*)/gi;
  while ((m = escapedCdnRegex.exec(html)) !== null) {
    const candidate = normalizeExtractedUrl(m[1]);
    if (candidate.startsWith('http')) addSource(candidate);
  }

  return sources;
}

// ── Source verification ──

async function verifyVideoSources(sources: VideoSource[], refererUrl?: string): Promise<VideoSource[]> {
  const checks = sources.slice(0, 20).map((source) => verifySingleSource(source, refererUrl));
  const results = await Promise.all(checks);
  return results.filter((r): r is VideoSource => !!r);
}

async function verifySingleSource(source: VideoSource, refererUrl?: string): Promise<VideoSource | null> {
  const commonHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (refererUrl) commonHeaders['Referer'] = refererUrl;

  try {
    const headRes = await fetch(source.url, {
      method: 'HEAD', redirect: 'follow', headers: commonHeaders,
      signal: AbortSignal.timeout(7000),
    });
    const headContentType = (headRes.headers.get('content-type') || '').toLowerCase();
    const headContentLength = headRes.headers.get('content-length');
    if (headRes.ok && isLikelyVideoSource(headContentType, source)) {
      return { ...source, size: headContentLength ? formatBytes(parseInt(headContentLength)) : source.size, format: source.format || guessFormat(headContentType, source.url) };
    }
  } catch {}

  try {
    const getRes = await fetch(source.url, {
      method: 'GET', redirect: 'follow',
      headers: { ...commonHeaders, Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(8000),
    });
    const ct = (getRes.headers.get('content-type') || '').toLowerCase();
    const cl = getRes.headers.get('content-length');
    const isPartial = getRes.status === 206 || getRes.status === 200;
    if (isPartial && isLikelyVideoSource(ct, source)) {
      return { ...source, size: cl ? formatBytes(parseInt(cl)) : source.size, format: source.format || guessFormat(ct, source.url) };
    }
  } catch {}

  return null;
}

function isLikelyVideoSource(contentType: string, source: VideoSource): boolean {
  const ct = contentType.toLowerCase();
  const url = source.url.toLowerCase();
  return (
    ct.includes('video') || ct.includes('octet-stream') || ct.includes('mp4') ||
    ct.includes('webm') || ct.includes('mpegurl') || ct.includes('x-mpegurl') ||
    ct.includes('vnd.apple.mpegurl') || ct.includes('dash') || ct.includes('matroska') ||
    source.format === 'hls' || source.format === 'dash' ||
    /\.(?:mp4|webm|mov|m3u8|mpd|m4v|flv|mkv|avi|ogv)(?:\?|$)/.test(url) ||
    /(fbcdn\.net|cdninstagram\.com|twimg\.com)\/.+/.test(url)
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function guessFormat(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  const u = url.toLowerCase();
  if (ct.includes('mp4') || u.includes('.mp4')) return 'mp4';
  if (ct.includes('webm') || u.includes('.webm')) return 'webm';
  if (ct.includes('mpegurl') || ct.includes('x-mpegurl') || ct.includes('vnd.apple.mpegurl') || u.includes('.m3u8')) return 'hls';
  if (ct.includes('dash') || u.includes('.mpd')) return 'dash';
  if (ct.includes('ogg') || u.includes('.ogg') || u.includes('.ogv')) return 'ogg';
  if (ct.includes('quicktime') || u.includes('.mov')) return 'mov';
  if (ct.includes('x-flv') || u.includes('.flv')) return 'flv';
  if (u.includes('.mkv')) return 'mkv';
  if (u.includes('.avi')) return 'avi';
  return 'mp4';
}
