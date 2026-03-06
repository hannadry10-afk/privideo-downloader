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

    // Try Invidious for YouTube
    if (isYouTube(url)) {
      const invResult = await tryInvidious(url, pageData);
      if (invResult) return jsonResponse(invResult);
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
      seen.add(normalized);
      merged.push({ ...source, url: normalized });
    }
  }

  return merged;
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
