import { useState, useEffect } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Button } from "@/components/ui/button";
import { Smartphone, X, Share } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Show on 'mobile' (default), 'desktop', or 'all' */
  showOn?: "mobile" | "desktop" | "all";
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function InstallPromptToast({ showOn = "mobile" }: Props) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("splittrip:install-dismissed") === "1");
  const [isStandalone, setIsStandalone] = useState(false);
  const isMobile = typeof window !== "undefined" && "ontouchstart" in window;
  const isDesktop = !isMobile;

  useEffect(() => {
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true
    );
  }, []);

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("splittrip:install-dismissed", "1");
  };

  // Don't show if already installed/standalone
  if (isInstalled || isStandalone || dismissed) return null;

  // Platform filtering
  if (showOn === "mobile" && isDesktop) return null;
  if (showOn === "desktop" && isMobile) return null;

  // iOS doesn't support beforeinstallprompt — show manual instructions
  const showIOSHint = isIOS() && !canInstall;
  const showPrompt = canInstall;

  if (!showPrompt && !showIOSHint) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-elevated">
        <button
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full hover:bg-secondary text-muted-foreground"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>

        {showIOSHint ? (
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-sm font-semibold">Install SplitTrip</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap <Share className="inline h-3 w-3 -mt-0.5" /> then <span className="font-medium">"Add to Home Screen"</span>
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-sm font-semibold">Install SplitTrip</p>
            <p className="text-xs text-muted-foreground mt-0.5">Get offline access & a native app feel.</p>
            <Button size="sm" className="mt-2 h-7 gap-1 text-xs" onClick={promptInstall}>
              <Smartphone className="h-3 w-3" /> Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
