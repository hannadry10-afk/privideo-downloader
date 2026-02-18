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

    // Fetch metadata via Open Graph scraping
    const metadata = await fetchMetadata(url);

    // Try cobalt API with proper headers
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
          return new Response(
            JSON.stringify({
              success: true,
              type: 'picker',
              audio: cobaltData.audio,
              picker: cobaltData.picker,
              metadata,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (cobaltData.status === 'redirect' || cobaltData.status === 'tunnel') {
          return new Response(
            JSON.stringify({
              success: true,
              type: 'direct',
              url: cobaltData.url,
              filename: cobaltData.filename,
              metadata,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (e) {
      console.log('Cobalt API not available, using metadata only');
    }

    // Return metadata even if download isn't available
    return new Response(
      JSON.stringify({
        success: true,
        type: 'metadata_only',
        metadata,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing video:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to process video' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchMetadata(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    const html = await response.text();

    const getMetaContent = (html: string, property: string): string | null => {
      const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
      const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
      const match = html.match(regex) || html.match(altRegex);
      return match ? match[1] : null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

    // Try to get video URL from meta tags
    const videoUrl = getMetaContent(html, 'og:video:url') || 
                     getMetaContent(html, 'og:video:secure_url') ||
                     getMetaContent(html, 'og:video') || '';

    const width = getMetaContent(html, 'og:video:width') || '';
    const height = getMetaContent(html, 'og:video:height') || '';

    return {
      title: getMetaContent(html, 'og:title') || titleMatch?.[1]?.trim() || 'Unknown',
      description: getMetaContent(html, 'og:description') || getMetaContent(html, 'description') || '',
      thumbnail: getMetaContent(html, 'og:image') || '',
      duration: getMetaContent(html, 'video:duration') || '',
      siteName: getMetaContent(html, 'og:site_name') || new URL(url).hostname,
      type: getMetaContent(html, 'og:type') || 'video',
      videoUrl,
      resolution: width && height ? `${width}x${height}` : '',
      author: getMetaContent(html, 'article:author') || getMetaContent(html, 'twitter:creator') || '',
      keywords: getMetaContent(html, 'keywords') || '',
    };
  } catch {
    return {
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
  }
}
