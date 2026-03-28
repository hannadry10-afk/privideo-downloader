import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return jsonResponse({ success: false, error: 'URL is required' }, 400);
    }

    console.log('Processing video URL:', url);

    // Fetch page with multiple user-agent strategies
    const pageData = await fetchPageDataWithRetry(url);

    // Try cobalt API first (supports many platforms)
    const cobaltResult = await tryCobalt(url, pageData);
    if (cobaltResult) return jsonResponse(cobaltResult);

    // Try Invidious / Piped for YouTube
    if (isYouTube(url)) {
      const invResult = await tryInvidious(url, pageData);
      if (invResult) return jsonResponse(invResult);
      const pipedResult = await tryPiped(url, pageData);
      if (pipedResult) return jsonResponse(pipedResult);
    }

    // Try TikTok extraction
    if (isTikTok(url)) {
      const ttResult = await tryTikTok(url, pageData);
      if (ttResult) return jsonResponse(ttResult);
    }

    // Try Twitter/X extraction
    if (isTwitter(url)) {
      const twResult = await tryTwitter(url, pageData);
      if (twResult) return jsonResponse(twResult);
    }

    // Try Instagram extraction
    if (isInstagram(url)) {
      const igResult = await tryInstagram(url, pageData);
      if (igResult) return jsonResponse(igResult);
    }

    // If we found video sources from scraping (or metadata video URL), verify and return
    const sourceCandidates = mergeUniqueSources(
      pageData.videoSources,
      pageData.metadata.videoUrl ? [{ url: pageData.metadata.videoUrl }] : [],
    );

    if (sourceCandidates.length > 0) {
      const verified = await verifyVideoSources(sourceCandidates, url);
      if (verified.length > 0) {
        return jsonResponse({
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

      // Fallback: keep unverified raw links so frontend can still offer play/open options
      return jsonResponse({
        success: true,
        type: 'metadata_only',
        metadata: pageData.metadata,
        videoSources: sourceCandidates,
      });
    }

    // Return metadata only
    return jsonResponse({
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

function isYouTube(url: string): boolean {
  return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(url);
}

function isTikTok(url: string): boolean {
  return /(?:tiktok\.com|vm\.tiktok\.com)/i.test(url);
}

function isTwitter(url: string): boolean {
  return /(?:twitter\.com|x\.com)\/\w+\/status/i.test(url);
}

function isInstagram(url: string): boolean {
  return /(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\//i.test(url);
}

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

function mergeUniqueSources(...groups: VideoSource[][]): VideoSource[] {
  const merged: VideoSource[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const source of group) {
      if (!source?.url) continue;
      const normalized = normalizeExtractedUrl(source.url);
      if (!normalized || seen.has(normalized)) continue;
      if (isAdOrJunkVideo(normalized)) continue;
      seen.add(normalized);
      merged.push({ ...source, url: normalized });
    }
  }

  return merged;
}

// ── Ad / junk / intro video filtering ──

const AD_DOMAIN_PATTERNS = [
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /googleadservices\.com/i,
  /googleads\.g\.doubleclick/i,
  /adnxs\.com/i,
  /adsrvr\.org/i,
  /adcolony\.com/i,
  /advertising\.com/i,
  /outbrain\.com/i,
  /taboola\.com/i,
  /criteo\.com/i,
  /moatads\.com/i,
  /serving-sys\.com/i,
  /teads\.tv/i,
  /pubmatic\.com/i,
  /rubiconproject\.com/i,
  /openx\.net/i,
  /spotxchange\.com/i,
  /springserve\.com/i,
  /innovid\.com/i,
  /imasdk\.googleapis\.com/i,
  /google\.com\/pagead/i,
  /amazon-adsystem\.com/i,
  /ads\.yahoo\.com/i,
  /adskeeper\.co/i,
  /mgid\.com/i,
  /revive-adserver/i,
  /flash\.player/i,
];

const AD_PATH_PATTERNS = [
  /\/ads?\//i,
  /\/advert/i,
  /\/sponsor/i,
  /\/promo(?:tion)?s?\//i,
  /\/preroll/i,
  /\/midroll/i,
  /\/postroll/i,
  /\/bumper/i,
  /\/intro[-_]?(?:video|clip|logo)/i,
  /\/outro[-_]?(?:video|clip|logo)/i,
  /\/watermark/i,
  /\/overlay/i,
  /\/pixel/i,
  /\/tracking/i,
  /\/beacon/i,
  /\/impression/i,
  /\/vast(?:\.xml|\?)/i,
  /\/vpaid/i,
  /\/vmap/i,
  /[?&]ad(?:_|%5F)?(?:id|unit|slot|tag|type)=/i,
  /[?&](?:click|imp)_?(?:url|tracker)=/i,
];

const AD_FILENAME_PATTERNS = [
  /^(?:ad|ads|advert|advertisement|sponsor|promo|bumper|intro|outro|logo|watermark|preroll|midroll|postroll)[-_.]?\d*\.(?:mp4|webm|mov)/i,
  /[-_](?:ad|ads|advert|sponsor|promo|bumper|preroll|midroll|postroll)[-_.]?\d*\.(?:mp4|webm|mov)/i,
];

function isAdOrJunkVideo(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fullUrl = parsed.href.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const filename = pathname.split('/').pop() || '';

    // Check ad domains
    for (const pattern of AD_DOMAIN_PATTERNS) {
      if (pattern.test(hostname) || pattern.test(fullUrl)) return true;
    }

    // Check ad paths
    for (const pattern of AD_PATH_PATTERNS) {
      if (pattern.test(pathname) || pattern.test(parsed.search)) return true;
    }

    // Check ad filenames
    for (const pattern of AD_FILENAME_PATTERNS) {
      if (pattern.test(filename)) return true;
    }

    // Filter tracking pixels (very small files typically < 5 chars in name, .gif/.png/.jpg)
    if (/^[a-z0-9]{1,4}\.(gif|png|jpg|jpeg)$/i.test(filename)) return true;

    // Filter VAST/VPAID ad tags
    if (/vast|vpaid|vmap/i.test(fullUrl) && /\.xml|tag|serve/i.test(fullUrl)) return true;

    return false;
  } catch {
    return false;
  }
}

// ── Cobalt ──

async function tryCobalt(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, downloadMode: 'auto', filenameStyle: 'pretty' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    console.log('Cobalt status:', data.status);

    if (data.status === 'picker') {
      return { success: true, type: 'picker', audio: data.audio, picker: data.picker, metadata: pageData.metadata, videoSources: pageData.videoSources };
    }
    if (data.status === 'redirect' || data.status === 'tunnel') {
      return { success: true, type: 'direct', url: data.url, filename: data.filename, metadata: pageData.metadata, videoSources: pageData.videoSources };
    }
  } catch (e) {
    console.log('Cobalt unavailable:', e);
  }
  return null;
}

// ── Invidious (YouTube) ──

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
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
      // Format streams (combined audio+video)
      for (const f of data.formatStreams || []) {
        if (f.url) {
          sources.push({ url: f.url, quality: f.qualityLabel || f.quality, format: f.container || 'mp4', type: 'combined' });
        }
      }
      // Adaptive formats (video only, usually higher quality)
      for (const f of data.adaptiveFormats || []) {
        if (f.url && f.type?.startsWith('video/')) {
          sources.push({ url: f.url, quality: f.qualityLabel || f.quality, format: f.container || 'mp4', type: 'video' });
        }
      }

      if (sources.length > 0) {
        const thumb = data.videoThumbnails?.find((t: any) => t.quality === 'maxresdefault')?.url || data.videoThumbnails?.[0]?.url || pageData.metadata.thumbnail;
        const meta = { ...pageData.metadata, title: data.title || pageData.metadata.title, thumbnail: thumb, author: data.author || pageData.metadata.author, duration: data.lengthSeconds?.toString() || pageData.metadata.duration };

        return {
          success: true,
          type: sources.length === 1 ? 'direct' : 'picker',
          url: sources.length === 1 ? sources[0].url : undefined,
          filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
          picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb, quality: s.quality, format: s.format, size: s.size })) : undefined,
          metadata: meta,
          videoSources: sources,
        };
      }
    } catch {
      continue;
    }
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
      // Also add video-only streams with higher quality
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
        return {
          success: true,
          type: sources.length === 1 ? 'direct' : 'picker',
          url: sources.length === 1 ? sources[0].url : undefined,
          filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
          picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality, format: s.format, size: s.size })) : undefined,
          metadata: meta,
          videoSources: sources,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ── TikTok extraction ──

async function tryTikTok(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: Use tikwm.com open API
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
        // No-watermark URL
        if (d.play) sources.push({ url: d.play, quality: 'HD (no watermark)', format: 'mp4', type: 'combined' });
        // HD play
        if (d.hdplay) sources.push({ url: d.hdplay, quality: 'HD+', format: 'mp4', type: 'combined' });
        // Watermarked version
        if (d.wmplay) sources.push({ url: d.wmplay, quality: 'Watermarked', format: 'mp4', type: 'combined' });
        // Audio
        if (d.music) sources.push({ url: d.music, quality: 'Audio', format: 'mp3', type: 'audio' });

        if (sources.length > 0) {
          const meta = {
            ...pageData.metadata,
            title: d.title || pageData.metadata.title,
            thumbnail: d.cover || d.origin_cover || pageData.metadata.thumbnail,
            author: d.author?.nickname || d.author?.unique_id || pageData.metadata.author,
            duration: d.duration?.toString() || pageData.metadata.duration,
          };
          return {
            success: true,
            type: sources.length === 1 ? 'direct' : 'picker',
            url: sources.length === 1 ? sources[0].url : undefined,
            filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
            picker: sources.length > 1 ? sources.map(s => ({ type: s.type === 'audio' ? 'audio' : 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality, format: s.format })) : undefined,
            metadata: meta,
            videoSources: sources,
          };
        }
      }
    }
  } catch (e) {
    console.log('tikwm fallback failed:', e);
  }

  // Strategy 2: Try tikcdn.io
  try {
    const res = await fetch('https://tikcdn.io/ssstik/' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('video')) {
      return {
        success: true,
        type: 'direct',
        url: res.url,
        filename: generateFilename(pageData.metadata.title, { url: res.url, format: 'mp4' }),
        metadata: pageData.metadata,
        videoSources: [{ url: res.url, quality: 'SD', format: 'mp4', type: 'combined' }],
      };
    }
  } catch (e) {
    console.log('tikcdn fallback failed:', e);
  }

  // Strategy 3: Scrape mobile TikTok page for __UNIVERSAL_DATA_FOR_REHYDRATION__
  try {
    const mobileUrl = url.replace('www.tiktok.com', 'm.tiktok.com');
    const res = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Extract from __UNIVERSAL_DATA_FOR_REHYDRATION__
    const ssrMatch = html.match(/window\['SIGI_STATE'\]\s*=\s*(\{[\s\S]*?\});/);
    const rehydrateMatch = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    const blob = ssrMatch?.[1] || rehydrateMatch?.[1] || '';

    if (blob) {
      const videoUrls: string[] = [];
      const urlPattern = /https?:\/\/[^"'\s\\]+\.(?:mp4|webm)(?:\?[^"'\s\\]*)?/g;
      let match;
      while ((match = urlPattern.exec(blob)) !== null) {
        videoUrls.push(normalizeExtractedUrl(match[0]));
      }

      // Also look for playAddr / downloadAddr keys
      const addrPattern = /["'](?:playAddr|downloadAddr|play_addr(?:_lowbr)?|download_addr)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi;
      while ((match = addrPattern.exec(blob)) !== null) {
        videoUrls.push(normalizeExtractedUrl(match[1]));
      }

      const unique = [...new Set(videoUrls)].filter(u => u.startsWith('http'));
      if (unique.length > 0) {
        const sources = unique.map(u => ({ url: u, quality: 'Direct', format: 'mp4', type: 'combined' as const }));
        return {
          success: true,
          type: sources.length === 1 ? 'direct' : 'picker',
          url: sources.length === 1 ? sources[0].url : undefined,
          filename: sources.length === 1 ? generateFilename(pageData.metadata.title, sources[0]) : undefined,
          picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb: pageData.metadata.thumbnail, quality: s.quality, format: s.format })) : undefined,
          metadata: pageData.metadata,
          videoSources: sources,
        };
      }
    }
  } catch (e) {
    console.log('TikTok mobile scrape failed:', e);
  }

  return null;
}

// ── Twitter/X extraction ──

async function tryTwitter(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: Use nitter instances to get direct video URLs
  const nitterInstances = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.cz',
  ];

  const tweetMatch = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i);
  if (!tweetMatch) return null;
  const [, user, tweetId] = tweetMatch;

  for (const instance of nitterInstances) {
    try {
      const nitterUrl = `${instance}/${user}/status/${tweetId}`;
      const res = await fetch(nitterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      const sources: VideoSource[] = [];
      // Nitter embeds video as <source> or <video> tags
      const srcRegex = /<source[^>]*src=["']([^"']+)["'][^>]*type=["']video\/([^"']+)["']/gi;
      let m;
      while ((m = srcRegex.exec(html)) !== null) {
        let videoUrl = m[1];
        if (videoUrl.startsWith('/')) videoUrl = `${instance}${videoUrl}`;
        sources.push({ url: videoUrl, quality: 'Direct', format: m[2] || 'mp4', type: 'combined' });
      }

      // Also try direct video tag src
      const videoSrc = html.match(/<video[^>]*src=["']([^"']+)["']/i);
      if (videoSrc) {
        let vUrl = videoSrc[1];
        if (vUrl.startsWith('/')) vUrl = `${instance}${vUrl}`;
        sources.push({ url: vUrl, quality: 'Direct', format: 'mp4', type: 'combined' });
      }

      if (sources.length > 0) {
        const titleMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
        const meta = {
          ...pageData.metadata,
          title: titleMatch?.[1]?.slice(0, 100) || pageData.metadata.title,
          author: user,
          siteName: 'Twitter / X',
        };
        return {
          success: true,
          type: sources.length === 1 ? 'direct' : 'picker',
          url: sources.length === 1 ? sources[0].url : undefined,
          filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
          picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality, format: s.format })) : undefined,
          metadata: meta,
          videoSources: sources,
        };
      }
    } catch {
      continue;
    }
  }

  // Strategy 2: Use fxtwitter.com API (returns JSON with video info)
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
          if (vid.url) {
            sources.push({ url: vid.url, quality: vid.height ? `${vid.height}p` : 'HD', format: 'mp4', type: 'combined' });
          }
        }
        // Also check for all variants
        for (const vid of tweet.media.videos) {
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
          return {
            success: true,
            type: sources.length === 1 ? 'direct' : 'picker',
            url: sources.length === 1 ? sources[0].url : undefined,
            filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
            picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality, format: s.format })) : undefined,
            metadata: meta,
            videoSources: sources,
          };
        }
      }
    }
  } catch (e) {
    console.log('fxtwitter fallback failed:', e);
  }

  // Strategy 3: Use vxtwitter/fixupx embed page scraping
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
          return {
            success: true,
            type: sources.length === 1 ? 'direct' : 'picker',
            url: sources.length === 1 ? sources[0].url : undefined,
            filename: sources.length === 1 ? generateFilename(meta.title, sources[0]) : undefined,
            picker: sources.length > 1 ? sources.map(s => ({ type: 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality, format: s.format })) : undefined,
            metadata: meta,
            videoSources: sources,
          };
        }
      }
    }
  } catch (e) {
    console.log('vxtwitter fallback failed:', e);
  }

  return null;
}

// ── Instagram extraction ──

async function tryInstagram(url: string, pageData: PageData): Promise<Record<string, unknown> | null> {
  // Strategy 1: Use ddinstagram (embed proxy)
  try {
    const igUrl = url.replace(/(?:www\.)?instagram\.com/, 'ddinstagram.com');
    const res = await fetch(igUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const html = await res.text();
      const sources: VideoSource[] = [];

      // Look for og:video
      const ogVideo = html.match(/<meta[^>]*property=["']og:video(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i);
      if (ogVideo) sources.push({ url: normalizeExtractedUrl(ogVideo[1]), quality: 'HD', format: 'mp4', type: 'combined' });

      // Look for direct video links
      const videoRegex = /["'](https?:\/\/[^"'\s]+(?:cdninstagram\.com|fbcdn\.net)[^"'\s]*\.mp4[^"'\s]*)["']/gi;
      let m;
      while ((m = videoRegex.exec(html)) !== null) {
        sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
      }

      if (sources.length > 0) {
        const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
        const ogThumb = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
        const meta = {
          ...pageData.metadata,
          title: ogTitle?.[1] || pageData.metadata.title,
          thumbnail: ogThumb?.[1] || pageData.metadata.thumbnail,
          siteName: 'Instagram',
        };
        const unique = mergeUniqueSources(sources);
        return {
          success: true,
          type: unique.length === 1 ? 'direct' : 'picker',
          url: unique.length === 1 ? unique[0].url : undefined,
          filename: unique.length === 1 ? generateFilename(meta.title, unique[0]) : undefined,
          picker: unique.length > 1 ? unique.map((s, i) => ({ type: 'video', url: s.url, thumb: meta.thumbnail, quality: s.quality || `Option ${i + 1}`, format: s.format })) : undefined,
          metadata: meta,
          videoSources: unique,
        };
      }
    }
  } catch (e) {
    console.log('ddinstagram failed:', e);
  }

  // Strategy 2: Use imginn.com as proxy
  try {
    const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortcode) {
      const imginnUrl = `https://imginn.com/p/${shortcode}/`;
      const res = await fetch(imginnUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];

        const videoSrcRegex = /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)["']/gi;
        let m;
        while ((m = videoSrcRegex.exec(html)) !== null) {
          sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
        }

        // data-video attributes
        const dataVideoRegex = /data-video=["'](https?:\/\/[^"']+)["']/gi;
        while ((m = dataVideoRegex.exec(html)) !== null) {
          sources.push({ url: normalizeExtractedUrl(m[1]), quality: 'Direct', format: 'mp4', type: 'combined' });
        }

        if (sources.length > 0) {
          const unique = mergeUniqueSources(sources);
          return {
            success: true,
            type: unique.length === 1 ? 'direct' : 'picker',
            url: unique.length === 1 ? unique[0].url : undefined,
            filename: unique.length === 1 ? generateFilename(pageData.metadata.title, unique[0]) : undefined,
            picker: unique.length > 1 ? unique.map((s, i) => ({ type: 'video', url: s.url, thumb: pageData.metadata.thumbnail, quality: s.quality || `Option ${i + 1}`, format: s.format })) : undefined,
            metadata: { ...pageData.metadata, siteName: 'Instagram' },
            videoSources: unique,
          };
        }
      }
    }
  } catch (e) {
    console.log('imginn failed:', e);
  }

  // Strategy 3: Embed page scraping via Instagram's embed endpoint
  try {
    const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortcode) {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const sources: VideoSource[] = [];

        // Video URL in embed JSON
        const videoUrlMatch = html.match(/["']video_url["']\s*:\s*["']([^"']+)["']/i);
        if (videoUrlMatch) {
          sources.push({ url: normalizeExtractedUrl(videoUrlMatch[1]), quality: 'HD', format: 'mp4', type: 'combined' });
        }

        // Direct CDN links
        const cdnRegex = /(https?:\/\/[^"'\s\\]+(?:cdninstagram\.com|fbcdn\.net)[^"'\s\\]*)/gi;
        let m;
        while ((m = cdnRegex.exec(html)) !== null) {
          const candidate = normalizeExtractedUrl(m[1]);
          if (/\.mp4|video/i.test(candidate)) {
            sources.push({ url: candidate, quality: 'Direct', format: 'mp4', type: 'combined' });
          }
        }

        if (sources.length > 0) {
          const unique = mergeUniqueSources(sources);
          return {
            success: true,
            type: unique.length === 1 ? 'direct' : 'picker',
            url: unique.length === 1 ? unique[0].url : undefined,
            filename: unique.length === 1 ? generateFilename(pageData.metadata.title, unique[0]) : undefined,
            picker: unique.length > 1 ? unique.map((s, i) => ({ type: 'video', url: s.url, thumb: pageData.metadata.thumbnail, quality: s.quality || `Option ${i + 1}`, format: s.format })) : undefined,
            metadata: { ...pageData.metadata, siteName: 'Instagram' },
            videoSources: unique,
          };
        }
      }
    }
  } catch (e) {
    console.log('Instagram embed scrape failed:', e);
  }

  return null;
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
        const videoSources = extractVideoSources(html, candidateUrl);

        if (videoSources.length > 0 || metadata.videoUrl || metadata.title !== 'Unknown') {
          return { metadata, videoSources };
        }
      } catch {
        continue;
      }
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
    const videoSources = extractVideoSources(body, url);
    const metadata = {
      title: 'Unknown',
      description: '',
      thumbnail: '',
      duration: '',
      siteName: new URL(url).hostname,
      type: 'video',
      videoUrl: '',
      resolution: '',
      author: '',
      keywords: '',
    };

    if (videoSources.length > 0) {
      return { metadata, videoSources };
    }
  } catch {
    // ignore mirror fallback failures
  }

  return null;
}

// ── Metadata extraction ──

function extractMetadata(html: string, url: string): Record<string, string> {
  const getMetaContent = (property: string): string => {
    const r1 = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
    const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
    return (html.match(r1) || html.match(r2))?.[1] || '';
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const videoUrl = getMetaContent('og:video:url') || getMetaContent('og:video:secure_url') || getMetaContent('og:video') || '';
  const width = getMetaContent('og:video:width');
  const height = getMetaContent('og:video:height');

  return {
    title: decodeHtmlEntities(getMetaContent('og:title') || titleMatch?.[1]?.trim() || 'Unknown'),
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

  const addSource = (rawUrl: string, quality?: string, format?: string) => {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.length < 10) return;
    try {
      const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, pageUrl).href;
      if (seenUrls.has(resolved)) return;
      seenUrls.add(resolved);
      sources.push({ url: resolved, quality, format });
    } catch { /* invalid URL */ }
  };

  let m;

  // 1. <video> tag src + poster
  const videoTagRegex = /<video[^>]*>/gi;
  while ((m = videoTagRegex.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
    if (srcMatch) addSource(srcMatch[1]);
    // data-src (lazy loaded)
    const dataSrcMatch = tag.match(/\sdata-src=["']([^"']+)["']/i);
    if (dataSrcMatch) addSource(dataSrcMatch[1]);
    // data-video-src
    const dataVideoSrc = tag.match(/\sdata-video-src=["']([^"']+)["']/i);
    if (dataVideoSrc) addSource(dataVideoSrc[1]);
  }

  // 2. <source> tags (inside or outside video elements)
  const sourceRegex = /<source[^>]*\ssrc=["']([^"']+)["'][^>]*(?:type=["']([^"']*)["'])?/gi;
  while ((m = sourceRegex.exec(html)) !== null) {
    const fmt = m[2]?.split('/')[1]?.split(';')[0];
    addSource(m[1], undefined, fmt);
  }
  // Reverse attribute order
  const sourceAlt = /<source[^>]*(?:type=["']([^"']*)["'])[^>]*\ssrc=["']([^"']+)["']/gi;
  while ((m = sourceAlt.exec(html)) !== null) {
    const fmt = m[1]?.split('/')[1]?.split(';')[0];
    addSource(m[2], undefined, fmt);
  }

  // 3. OG video meta tags
  const ogVideoRegex = /<meta[^>]*(?:property|name)=["']og:video(?::(?:url|secure_url))?["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = ogVideoRegex.exec(html)) !== null) addSource(m[1]);
  const ogVideoAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:video(?::(?:url|secure_url))?["']/gi;
  while ((m = ogVideoAlt.exec(html)) !== null) addSource(m[1]);

  // 4. Twitter player stream
  const tw = html.match(/<meta[^>]*(?:property|name)=["']twitter:player:stream["'][^>]*content=["']([^"']+)["']/i);
  if (tw) addSource(tw[1]);

  // 5. Direct video file URLs anywhere in HTML
  const directLinkRegex = /["'](https?:\/\/[^"'\s<>]+\.(?:mp4|webm|mov|m4v|avi|mkv|flv|wmv|3gp|ogv)(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = directLinkRegex.exec(html)) !== null) addSource(m[1]);

  // 6. JSON-LD contentUrl / embedUrl / video objects
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRegex.exec(html)) !== null) {
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
      walkJsonLd(JSON.parse(m[1]));
    } catch { /* invalid json */ }
  }

  // 7. JS variable patterns for video URLs
  const jsPatterns = [
    /["'](?:video[_-]?(?:url|src|file|path)|file[_-]?url|source[_-]?url|mp4[_-]?url|hls[_-]?url|dash[_-]?url|stream[_-]?url|download[_-]?url|media[_-]?url|content[_-]?url|playback[_-]?url)["']\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /(?:videoUrl|videoSrc|fileSrc|streamUrl|mp4Url|hlsUrl|downloadUrl|mediaUrl|contentUrl|playbackUrl|sourceUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /"(?:url|src|file|source|stream)":\s*"(https?:\/\/[^"]+\.(?:mp4|webm|m3u8|mpd|mov|flv)[^"]*)"/gi,
  ];
  for (const pat of jsPatterns) {
    while ((m = pat.exec(html)) !== null) addSource(m[1]);
  }

  // 8. HLS / DASH streams
  const hlsRegex = /["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = hlsRegex.exec(html)) !== null) addSource(m[1], undefined, 'hls');
  const dashRegex = /["'](https?:\/\/[^"'\s<>]+\.mpd(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = dashRegex.exec(html)) !== null) addSource(m[1], undefined, 'dash');

  // 9. <iframe> embeds pointing to known players
  const iframeRegex = /<iframe[^>]*\ssrc=["']([^"']+)["']/gi;
  while ((m = iframeRegex.exec(html)) !== null) {
    const iframeSrc = m[1];
    // Only extract if it looks like a video embed
    if (/\.(mp4|webm|mov|m3u8)/.test(iframeSrc) || /embed|player|video/i.test(iframeSrc)) {
      addSource(iframeSrc);
    }
  }

  // 10. data-* attributes with video URLs
  const dataAttrRegex = /data-(?:video|src|url|file|media|stream|hd|sd|mobile)[_-]?(?:url|src|file|href)?=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = dataAttrRegex.exec(html)) !== null) addSource(m[1]);

  // 11. window.__INITIAL_STATE__ or similar SSR data blobs
  const ssrBlobRegex = /(?:window\.__[A-Z_]+__|window\.\w+Data|window\.initialProps)\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/gi;
  while ((m = ssrBlobRegex.exec(html)) !== null) {
    try {
      const blob = m[1];
      // Extract URLs from the blob
      const urlsInBlob = /https?:\/\/[^"'\s<>\\]+\.(?:mp4|webm|m3u8|mov|flv)(?:\?[^"'\s<>\\]*)?/gi;
      let u;
      while ((u = urlsInBlob.exec(blob)) !== null) {
        addSource(u[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
      }
    } catch { /* ignore */ }
  }

  // 12. Platform-specific JSON keys (helps with Facebook and similar players)
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

  // 13. Escaped CDN links without explicit file extensions
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

  if (refererUrl) {
    commonHeaders['Referer'] = refererUrl;
  }

  try {
    const headRes = await fetch(source.url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: commonHeaders,
      signal: AbortSignal.timeout(7000),
    });

    const headContentType = (headRes.headers.get('content-type') || '').toLowerCase();
    const headContentLength = headRes.headers.get('content-length');

    if (headRes.ok && isLikelyVideoSource(headContentType, source)) {
      return {
        ...source,
        size: headContentLength ? formatBytes(parseInt(headContentLength)) : source.size,
        format: source.format || guessFormat(headContentType, source.url),
      };
    }
  } catch {
    // Some hosts block HEAD, fallback to ranged GET below
  }

  try {
    const getRes = await fetch(source.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { ...commonHeaders, Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(8000),
    });

    const ct = (getRes.headers.get('content-type') || '').toLowerCase();
    const cl = getRes.headers.get('content-length');
    const isPartial = getRes.status === 206 || getRes.status === 200;

    if (isPartial && isLikelyVideoSource(ct, source)) {
      return {
        ...source,
        size: cl ? formatBytes(parseInt(cl)) : source.size,
        format: source.format || guessFormat(ct, source.url),
      };
    }
  } catch {
    // unreachable
  }

  return null;
}

function isLikelyVideoSource(contentType: string, source: VideoSource): boolean {
  const ct = contentType.toLowerCase();
  const url = source.url.toLowerCase();

  return (
    ct.includes('video') ||
    ct.includes('octet-stream') ||
    ct.includes('mp4') ||
    ct.includes('webm') ||
    ct.includes('mpegurl') ||
    ct.includes('x-mpegurl') ||
    ct.includes('vnd.apple.mpegurl') ||
    ct.includes('dash') ||
    ct.includes('matroska') ||
    source.format === 'hls' ||
    source.format === 'dash' ||
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
