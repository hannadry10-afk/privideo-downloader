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

export interface PickerItem {
  type: string;
  url: string;
  thumb?: string;
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
  data?: any;
}

export async function fetchVideo(url: string): Promise<VideoResult> {
  const { data, error } = await supabase.functions.invoke('fetch-video', {
    body: { url },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}
