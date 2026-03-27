import { useState } from 'react';
import { Link2, Download, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const UrlInput = ({ onSubmit, isLoading }: UrlInputProps) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      // Clipboard access denied
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="glass rounded-2xl p-1.5 md:p-2 glow-border animate-pulse-glow">
        <div className="flex gap-1.5 md:gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video URL..."
              className="pl-9 md:pl-12 pr-2 h-11 md:h-14 bg-secondary/50 border-0 text-sm md:text-lg placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
              required
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handlePaste}
            className="h-11 md:h-14 px-3 md:px-4 text-xs md:text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          >
            Paste
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="h-11 md:h-14 px-4 md:px-8 rounded-xl bg-primary text-primary-foreground font-semibold text-sm md:text-base hover:bg-primary/90 disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2" />
                Fetch
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-center text-muted-foreground text-xs md:text-sm mt-3 md:mt-4">
        Supports YouTube, Twitter/X, TikTok, Instagram, Reddit, Vimeo & more
      </p>
    </form>
  );
};

export default UrlInput;
