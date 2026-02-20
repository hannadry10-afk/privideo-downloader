import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScannedVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  url: string;
  sourceUrl: string;
  format: string;
  quality: string;
  size: string;
  author: string;
  dateUploaded: string;
  siteName: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return json({ success: false, error: 'URL is required' }, 400);
    }

    console.log('Scanning site for videos:', url);

    const videos: ScannedVideo[] = [];
    const seenUrls = new Set<string>();

    // Fetch main page with multiple user agents
    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ];

    let html = '';
    let fetchedUrl = url;

    for (const ua of USER_AGENTS) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
        });
        html = await res.text();
        fetchedUrl = res.url || url;
        if (html.length > 500) break;
      } catch { continue; }
    }

    if (!html) {
      return json({ success: false, error: 'Could not fetch the page' }, 400);
    }

    const baseUrl = new URL(fetchedUrl).origin;
    const siteName = new URL(fetchedUrl).hostname.replace('www.', '');

    // 1. Extract all video elements with their metadata
    extractVideoTags(html, baseUrl, siteName, videos, seenUrls);

    // 2. Extract from JSON-LD structured data
    extractJsonLd(html, baseUrl, siteName, videos, seenUrls);

    // 3. Extract from OG/meta tags (main page video)
    extractOgVideo(html, baseUrl, siteName, videos, seenUrls);

    // 4. Extract video links from anchors and iframes
    extractVideoLinks(html, baseUrl, siteName, videos, seenUrls);

    // 5. Extract from JS data blobs
    extractFromJsBlobs(html, baseUrl, siteName, videos, seenUrls);

    // 6. Extract direct file links (.mp4, .webm, etc.)
    extractDirectLinks(html, baseUrl, siteName, videos, seenUrls);

    // 7. Extract embedded players (YouTube, Vimeo, etc.)
    extractEmbeddedPlayers(html, baseUrl, siteName, videos, seenUrls);

    // Verify which video URLs are actually accessible
    const verified = await verifyVideos(videos);

    console.log(`Found ${verified.length} verified videos out of ${videos.length} candidates`);

    return json({
      success: true,
      videos: verified,
      totalFound: verified.length,
      scannedUrl: fetchedUrl,
      siteName,
    });

  } catch (error) {
    console.error('Scan error:', error);
    return json({ success: false, error: error instanceof Error ? error.message : 'Scan failed' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function resolveUrl(raw: string, base: string): string | null {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.length < 5) return null;
  try {
    return raw.startsWith('http') ? raw : new URL(raw, base).href;
  } catch { return null; }
}

function getMeta(html: string, prop: string): string {
  const r1 = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  return (html.match(r1) || html.match(r2))?.[1] || '';
}

function addVideo(
  videos: ScannedVideo[], seenUrls: Set<string>,
  videoUrl: string, partial: Partial<ScannedVideo>
) {
  if (seenUrls.has(videoUrl)) return;
  seenUrls.add(videoUrl);

  const ext = videoUrl.match(/\.(mp4|webm|mov|m3u8|mpd|flv|mkv|avi|ogg|3gp|wmv)/i)?.[1] || '';

  videos.push({
    id: makeId(),
    title: partial.title || 'Untitled Video',
    description: partial.description || '',
    thumbnail: partial.thumbnail || '',
    duration: partial.duration || '',
    url: videoUrl,
    sourceUrl: partial.sourceUrl || videoUrl,
    format: partial.format || ext || 'mp4',
    quality: partial.quality || '',
    size: partial.size || '',
    author: partial.author || '',
    dateUploaded: partial.dateUploaded || '',
    siteName: partial.siteName || '',
  });
}

// ── Extractors ──

function extractVideoTags(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  // Match <video> blocks including their inner <source> tags
  const videoBlockRegex = /<video[^>]*>([\s\S]*?)<\/video>/gi;
  const videoSelfRegex = /<video[^>]*\/>/gi;
  let m;

  const processVideoTag = (tag: string, inner: string) => {
    const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
    const posterMatch = tag.match(/\sposter=["']([^"']+)["']/i);
    const dataSrcMatch = tag.match(/\sdata-src=["']([^"']+)["']/i);
    const titleMatch = tag.match(/\s(?:title|aria-label|data-title)=["']([^"']+)["']/i);

    const thumbnail = posterMatch ? resolveUrl(posterMatch[1], base) || '' : '';
    const title = titleMatch?.[1] || '';

    // Get sources from inner <source> tags
    const sourceRegex = /<source[^>]*\ssrc=["']([^"']+)["'][^>]*/gi;
    let s;
    while ((s = sourceRegex.exec(inner)) !== null) {
      const resolved = resolveUrl(s[1], base);
      if (resolved) {
        const typeMatch = s[0].match(/type=["']([^"']*)["']/i);
        const fmt = typeMatch?.[1]?.split('/')[1]?.split(';')[0] || '';
        const labelMatch = s[0].match(/(?:label|data-quality|data-res)=["']([^"']+)["']/i);
        addVideo(videos, seen, resolved, { thumbnail, title, format: fmt, quality: labelMatch?.[1] || '', siteName });
      }
    }

    // Direct src on <video>
    const directSrc = srcMatch?.[1] || dataSrcMatch?.[1];
    if (directSrc) {
      const resolved = resolveUrl(directSrc, base);
      if (resolved) addVideo(videos, seen, resolved, { thumbnail, title, siteName });
    }
  };

  while ((m = videoBlockRegex.exec(html)) !== null) {
    processVideoTag(m[0], m[1]);
  }
  while ((m = videoSelfRegex.exec(html)) !== null) {
    processVideoTag(m[0], '');
  }
}

function extractJsonLd(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const walk = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) { obj.forEach(walk); return; }

        const isVideo = typeof obj['@type'] === 'string' && /video/i.test(obj['@type']);
        if (isVideo || obj.contentUrl || obj.embedUrl) {
          const videoUrl = obj.contentUrl || obj.embedUrl || obj.url;
          if (videoUrl) {
            const resolved = resolveUrl(videoUrl, base);
            if (resolved) {
              addVideo(videos, seen, resolved, {
                title: obj.name || obj.headline || '',
                description: obj.description || '',
                thumbnail: obj.thumbnailUrl || (Array.isArray(obj.thumbnail) ? obj.thumbnail[0]?.url : obj.thumbnail?.url) || obj.image?.url || (typeof obj.image === 'string' ? obj.image : '') || '',
                duration: obj.duration || '',
                author: obj.author?.name || (typeof obj.author === 'string' ? obj.author : '') || '',
                dateUploaded: obj.uploadDate || obj.datePublished || obj.dateCreated || '',
                siteName,
              });
            }
          }
        }

        if (obj.video) walk(obj.video);
        if (obj['@graph']) walk(obj['@graph']);
        if (obj.itemListElement) walk(obj.itemListElement);
        if (obj.mainEntity) walk(obj.mainEntity);
      };
      walk(JSON.parse(m[1]));
    } catch { /* invalid json */ }
  }
}

function extractOgVideo(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  const ogVideo = getMeta(html, 'og:video:url') || getMeta(html, 'og:video:secure_url') || getMeta(html, 'og:video');
  const twitterStream = getMeta(html, 'twitter:player:stream');
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '';

  const partial: Partial<ScannedVideo> = {
    title: getMeta(html, 'og:title') || titleTag,
    description: getMeta(html, 'og:description') || getMeta(html, 'description'),
    thumbnail: getMeta(html, 'og:image'),
    duration: getMeta(html, 'video:duration'),
    author: getMeta(html, 'article:author') || getMeta(html, 'twitter:creator'),
    dateUploaded: getMeta(html, 'article:published_time') || getMeta(html, 'date'),
    siteName,
  };

  if (ogVideo) {
    const resolved = resolveUrl(ogVideo, base);
    if (resolved) addVideo(videos, seen, resolved, partial);
  }
  if (twitterStream) {
    const resolved = resolveUrl(twitterStream, base);
    if (resolved) addVideo(videos, seen, resolved, partial);
  }
}

function extractVideoLinks(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  // <a> tags linking to video files
  const aRegex = /<a[^>]*\shref=["']([^"']+\.(?:mp4|webm|mov|avi|mkv|flv|wmv|3gp|ogv|m4v)(?:\?[^"']*)?)["'][^>]*>([^<]*)</gi;
  let m;
  while ((m = aRegex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], base);
    if (resolved) addVideo(videos, seen, resolved, { title: m[2]?.trim() || '', siteName });
  }

  // <iframe> embeds
  const iframeRegex = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*/gi;
  while ((m = iframeRegex.exec(html)) !== null) {
    const src = m[1];
    if (/\.(mp4|webm|mov|m3u8)/.test(src) || /embed|player|video/i.test(src)) {
      const resolved = resolveUrl(src, base);
      if (resolved) addVideo(videos, seen, resolved, { siteName });
    }
  }
}

function extractFromJsBlobs(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  // Common JS patterns
  const patterns = [
    /["'](?:video[_-]?(?:url|src|file)|file[_-]?url|source[_-]?url|mp4[_-]?url|stream[_-]?url|download[_-]?url|media[_-]?url|content[_-]?url|playback[_-]?url)["']\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /(?:videoUrl|videoSrc|streamUrl|mp4Url|hlsUrl|downloadUrl|mediaUrl|contentUrl|playbackUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
  ];

  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(html)) !== null) {
      const resolved = resolveUrl(m[1], base);
      if (resolved) addVideo(videos, seen, resolved, { siteName });
    }
  }

  // SSR blobs
  const ssrRegex = /(?:window\.__[A-Z_]+__|window\.\w+Data)\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|\n)/gi;
  let m;
  while ((m = ssrRegex.exec(html)) !== null) {
    const urlRegex = /https?:\/\/[^"'\s<>\\]+\.(?:mp4|webm|m3u8|mov|flv)(?:\?[^"'\s<>\\]*)?/gi;
    let u;
    while ((u = urlRegex.exec(m[1])) !== null) {
      const cleaned = u[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      addVideo(videos, seen, cleaned, { siteName });
    }
  }
}

function extractDirectLinks(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  const regex = /["'](https?:\/\/[^"'\s<>]+\.(?:mp4|webm|mov|m4v|avi|mkv|flv|wmv|3gp|ogv)(?:\?[^"'\s<>]*)?)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], base);
    if (resolved) addVideo(videos, seen, resolved, { siteName });
  }

  // HLS/DASH
  const hlsRegex = /["'](https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = hlsRegex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], base);
    if (resolved) addVideo(videos, seen, resolved, { format: 'hls', siteName });
  }
  const dashRegex = /["'](https?:\/\/[^"'\s<>]+\.mpd(?:\?[^"'\s<>]*)?)["']/gi;
  while ((m = dashRegex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], base);
    if (resolved) addVideo(videos, seen, resolved, { format: 'dash', siteName });
  }

  // data-* attributes
  const dataAttrRegex = /data-(?:video|src|url|file|media|stream|hd|sd)[_-]?(?:url|src|file|href)?=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = dataAttrRegex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1], base);
    if (resolved) addVideo(videos, seen, resolved, { siteName });
  }
}

function extractEmbeddedPlayers(html: string, base: string, siteName: string, videos: ScannedVideo[], seen: Set<string>) {
  // YouTube embeds
  const ytRegex = /(?:youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
  let m;
  while ((m = ytRegex.exec(html)) !== null) {
    const ytUrl = `https://www.youtube.com/watch?v=${m[1]}`;
    addVideo(videos, seen, ytUrl, {
      thumbnail: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,
      siteName: 'YouTube',
    });
  }

  // Vimeo embeds
  const vimeoRegex = /player\.vimeo\.com\/video\/(\d+)/gi;
  while ((m = vimeoRegex.exec(html)) !== null) {
    addVideo(videos, seen, `https://vimeo.com/${m[1]}`, { siteName: 'Vimeo' });
  }

  // Dailymotion
  const dmRegex = /dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/gi;
  while ((m = dmRegex.exec(html)) !== null) {
    addVideo(videos, seen, `https://www.dailymotion.com/video/${m[1]}`, { siteName: 'Dailymotion' });
  }
}

// ── Verification ──

async function verifyVideos(videos: ScannedVideo[]): Promise<ScannedVideo[]> {
  if (videos.length === 0) return [];

  // For embedded platform URLs (YouTube, Vimeo), skip HEAD check
  const platformUrls = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|instagram\.com|twitter\.com|x\.com/i;

  const checks = videos.slice(0, 30).map(async (video) => {
    if (platformUrls.test(video.url)) return video; // trust platform URLs

    try {
      const res = await fetch(video.url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const cl = res.headers.get('content-length');
        if (ct.includes('video') || ct.includes('octet-stream') || ct.includes('mp4') || ct.includes('webm') ||
            ct.includes('mpegurl') || ct.includes('dash') ||
            /\.(?:mp4|webm|mov|m3u8|mpd)/.test(video.url)) {
          return { ...video, size: cl ? formatBytes(parseInt(cl)) : video.size };
        }
      }
    } catch { /* unreachable */ }
    return null;
  });

  const results = await Promise.all(checks);
  return results.filter((r): r is ScannedVideo => r !== null);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}
