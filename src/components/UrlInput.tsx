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
      <div className="glass rounded-2xl p-2 glow-border animate-pulse-glow">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video URL here..."
              className="pl-12 pr-4 h-14 bg-secondary/50 border-0 text-lg placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
              required
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handlePaste}
            className="h-14 px-4 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          >
            Paste
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="h-14 px-8 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Fetch
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-center text-muted-foreground text-sm mt-4">
        Supports YouTube, Twitter/X, TikTok, Instagram, Reddit, Vimeo & more
      </p>
    </form>
  );
};

export default UrlInput;
