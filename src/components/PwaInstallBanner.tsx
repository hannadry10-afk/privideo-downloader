import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PwaInstallBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show in iframes or preview hosts
    try {
      if (window.self !== window.top) return;
    } catch { return; }
    if (window.location.hostname.includes('id-preview--') || window.location.hostname.includes('lovableproject.com')) return;

    // Check if already dismissed this session
    if (sessionStorage.getItem('pwa-dismissed')) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-dismissed', '1');
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden animate-in slide-in-from-bottom-4">
      <div className="glass rounded-xl p-3 border border-primary/30 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">Install Incognito Zone</p>
          <p className="text-[10px] text-muted-foreground">Add to home screen for quick access</p>
        </div>
        <Button size="sm" onClick={handleInstall} className="text-xs h-7 px-3 shrink-0">
          Install
        </Button>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallBanner;
