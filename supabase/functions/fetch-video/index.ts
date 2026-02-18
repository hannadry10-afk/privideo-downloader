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
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing video URL:', url);

    // Fetch page HTML for metadata + video source extraction
    const pageData = await fetchPageData(url);

    // Try cobalt API first
    try {
      const cobaltResponse = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          downloadMode: 'auto',
          filenameStyle: 'pretty',
        }),
      });

      if (cobaltResponse.ok) {
        const cobaltData = await cobaltResponse.json();
        console.log('Cobalt status:', cobaltData.status);

        if (cobaltData.status === 'picker') {
          return jsonResponse({
            success: true,
            type: 'picker',
            audio: cobaltData.audio,
            picker: cobaltData.picker,
            metadata: pageData.metadata,
            videoSources: pageData.videoSources,
          });
        }

        if (cobaltData.status === 'redirect' || cobaltData.status === 'tunnel') {
          return jsonResponse({
            success: true,
            type: 'direct',
            url: cobaltData.url,
            filename: cobaltData.filename,
            metadata: pageData.metadata,
            videoSources: pageData.videoSources,
          });
        }
      }
    } catch (e) {
      console.log('Cobalt API not available, falling back to scraping');
    }

    // If cobalt fails, check if we found video sources from scraping
    if (pageData.videoSources.length > 0) {
      // Verify which sources are actually accessible
      const verifiedSources = await verifyVideoSources(pageData.videoSources);

      if (verifiedSources.length > 0) {
        if (verifiedSources.length === 1) {
          return jsonResponse({
            success: true,
            type: 'direct',
            url: verifiedSources[0].url,
            filename: generateFilename(pageData.metadata.title, verifiedSources[0]),
            metadata: pageData.metadata,
            videoSources: verifiedSources,
          });
        }
        return jsonResponse({
          success: true,
          type: 'picker',
          picker: verifiedSources.map(s => ({
            type: 'video',
            url: s.url,
            thumb: pageData.metadata.thumbnail,
            quality: s.quality,
            format: s.format,
            size: s.size,
          })),
          metadata: pageData.metadata,
          videoSources: verifiedSources,
        });
      }
    }

    // Return metadata only
    return jsonResponse({
      success: true,
      type: 'metadata_only',
      metadata: pageData.metadata,
      videoSources: pageData.videoSources,
    });

  } catch (error) {
    console.error('Error processing video:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to process video' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

async function verifyVideoSources(sources: VideoSource[]): Promise<VideoSource[]> {
  const verified: VideoSource[] = [];

  for (const source of sources.slice(0, 10)) {
    try {
      const res = await fetch(source.url, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const contentLength = res.headers.get('content-length');
        if (contentType.includes('video') || contentType.includes('octet-stream') || contentType.includes('mp4') || contentType.includes('webm')) {
          verified.push({
            ...source,
            size: contentLength ? formatBytes(parseInt(contentLength)) : source.size,
            format: source.format || guessFormat(contentType, source.url),
          });
        }
      }
    } catch {
      // skip unreachable
    }
  }
  return verified;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function guessFormat(contentType: string, url: string): string {
  if (contentType.includes('mp4') || url.includes('.mp4')) return 'mp4';
  if (contentType.includes('webm') || url.includes('.webm')) return 'webm';
  if (contentType.includes('ogg') || url.includes('.ogg')) return 'ogg';
  if (contentType.includes('avi') || url.includes('.avi')) return 'avi';
  if (contentType.includes('mov') || url.includes('.mov')) return 'mov';
  return 'mp4';
}

async function fetchPageData(url: string): Promise<{ metadata: Record<string, string>; videoSources: VideoSource[] }> {
  const defaultMeta = {
    title: 'Unknown', description: '', thumbnail: '', duration: '',
    siteName: new URL(url).hostname, type: 'video', videoUrl: '',
    resolution: '', author: '', keywords: '',
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
    });
    const html = await response.text();

    const metadata = extractMetadata(html, url);
    const videoSources = extractVideoSources(html, url);

    return { metadata, videoSources };
  } catch {
    return { metadata: defaultMeta, videoSources: [] };
  }
}

function extractMetadata(html: string, url: string): Record<string, string> {
  const getMetaContent = (property: string): string => {
    const r1 = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
    const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
    const match = html.match(r1) || html.match(r2);
    return match ? match[1] : '';
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const videoUrl = getMetaContent('og:video:url') || getMetaContent('og:video:secure_url') || getMetaContent('og:video') || '';
  const width = getMetaContent('og:video:width');
  const height = getMetaContent('og:video:height');

  return {
    title: getMetaContent('og:title') || titleMatch?.[1]?.trim() || 'Unknown',
    description: getMetaContent('og:description') || getMetaContent('description') || '',
    thumbnail: getMetaContent('og:image') || '',
    duration: getMetaContent('video:duration') || '',
    siteName: getMetaContent('og:site_name') || new URL(url).hostname,
    type: getMetaContent('og:type') || 'video',
    videoUrl,
    resolution: width && height ? `${width}x${height}` : '',
    author: getMetaContent('article:author') || getMetaContent('twitter:creator') || '',
    keywords: getMetaContent('keywords') || '',
  };
}

function extractVideoSources(html: string, pageUrl: string): VideoSource[] {
  const sources: VideoSource[] = [];
  const seenUrls = new Set<string>();

  const addSource = (rawUrl: string, quality?: string, format?: string) => {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return;
    try {
      const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, pageUrl).href;
      if (seenUrls.has(resolved)) return;
      seenUrls.add(resolved);
      sources.push({ url: resolved, quality, format });
    } catch { /* invalid URL */ }
  };

  // 1. <video> tag src
  const videoSrcRegex = /<video[^>]*\ssrc=["']([^"']+)["']/gi;
  let m;
  while ((m = videoSrcRegex.exec(html)) !== null) addSource(m[1]);

  // 2. <source> inside <video>
  const sourceRegex = /<source[^>]*\ssrc=["']([^"']+)["'][^>]*(?:type=["']([^"']*)["'])?/gi;
  while ((m = sourceRegex.exec(html)) !== null) {
    const fmt = m[2]?.split('/')[1]?.split(';')[0];
    addSource(m[1], undefined, fmt);
  }

  // 3. OG video meta tags
  const ogVideoRegex = /<meta[^>]*(?:property|name)=["']og:video(?::(?:url|secure_url))?["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = ogVideoRegex.exec(html)) !== null) addSource(m[1]);
  const ogVideoAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:video(?::(?:url|secure_url))?["']/gi;
  while ((m = ogVideoAlt.exec(html)) !== null) addSource(m[1]);

  // 4. Twitter player stream
  const twitterStream = /<meta[^>]*(?:property|name)=["']twitter:player:stream["'][^>]*content=["']([^"']+)["']/i;
  const tw = html.match(twitterStream);
  if (tw) addSource(tw[1]);

  // 5. Direct .mp4/.webm/.mov links in HTML
  const directLinkRegex = /["'](https?:\/\/[^"'\s]+\.(?:mp4|webm|mov|m4v|avi|mkv)(?:\?[^"'\s]*)?)["']/gi;
  while ((m = directLinkRegex.exec(html)) !== null) addSource(m[1]);

  // 6. JSON-LD contentUrl / embedUrl
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.contentUrl) addSource(item.contentUrl);
        if (item.embedUrl) addSource(item.embedUrl);
        if (item.video?.contentUrl) addSource(item.video.contentUrl);
        if (item.video?.embedUrl) addSource(item.video.embedUrl);
      }
    } catch { /* invalid json */ }
  }

  // 7. Common JS patterns: videoUrl, video_url, file_url, source_url, mp4
  const jsPatterns = [
    /["'](?:video[_-]?(?:url|src)|file[_-]?url|source[_-]?url|mp4[_-]?url|hls[_-]?url|dash[_-]?url|stream[_-]?url)["']\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    /(?:videoUrl|videoSrc|fileSrc|streamUrl|mp4Url|hlsUrl)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
  ];
  for (const pat of jsPatterns) {
    while ((m = pat.exec(html)) !== null) addSource(m[1]);
  }

  // 8. .m3u8 HLS streams
  const hlsRegex = /["'](https?:\/\/[^"'\s]+\.m3u8(?:\?[^"'\s]*)?)["']/gi;
  while ((m = hlsRegex.exec(html)) !== null) {
    addSource(m[1], undefined, 'hls');
  }

  return sources;
}
