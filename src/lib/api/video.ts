import { supabase } from '@/integrations/supabase/client';

export interface VideoMetadata {
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  siteName: string;
  type: string;
  videoUrl?: string;
  resolution?: string;
  author?: string;
  keywords?: string;
}

export interface VideoSource {
  url: string;
  quality?: string;
  format?: string;
  size?: string;
  type?: string;
  verified?: boolean;
}

export interface PickerItem {
  type: string;
  url: string;
  thumb?: string;
  quality?: string;
  format?: string;
  size?: string;
}

export interface VideoResult {
  success: boolean;
  type?: 'direct' | 'picker' | 'metadata_only';
  url?: string;
  filename?: string;
  picker?: PickerItem[];
  audio?: string;
  error?: string;
  metadata?: VideoMetadata;
  videoSources?: VideoSource[];
}

// ── Client-side in-memory cache ──
const clientCache = new Map<string, { result: VideoResult; timestamp: number }>();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Deduplicate in-flight requests
const inflightRequests = new Map<string, Promise<VideoResult>>();

export async function fetchVideo(url: string): Promise<VideoResult> {
  // Check client cache
  const cached = clientCache.get(url);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL) {
    return cached.result;
  }

  // Deduplicate: if same URL is already being fetched, return the same promise
  const inflight = inflightRequests.get(url);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-video', {
        body: { url },
      });

      if (error) {
        return { success: false, error: error.message } as VideoResult;
      }

      const result = data as VideoResult;

      // Cache successful results
      if (result.success) {
        clientCache.set(url, { result, timestamp: Date.now() });
        // Evict old entries
        if (clientCache.size > 100) {
          const oldest = clientCache.keys().next().value;
          if (oldest) clientCache.delete(oldest);
        }
      }

      return result;
    } finally {
      inflightRequests.delete(url);
    }
  })();

  inflightRequests.set(url, promise);
  return promise;
}

/** Clear the client-side cache for a specific URL or all URLs */
export function clearVideoCache(url?: string) {
  if (url) {
    clientCache.delete(url);
  } else {
    clientCache.clear();
  }
}
