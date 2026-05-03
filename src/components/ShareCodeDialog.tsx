import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ShareCodeDialog({
  open,
  onOpenChange,
  code,
  groupName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  code: string;
  groupName: string;
}) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const url = typeof window !== "undefined" ? `${window.location.origin}/?join=${code}` : `/?join=${code}`;

  useEffect(() => {
    if (open) {
      QRCode.toDataURL(url, { width: 280, margin: 1 })
        .then(setQr)
        .catch(() => setQr(""));
    }
  }, [open, url]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied("code");
    toast.success("Code copied");
    setTimeout(() => setCopied(null), 1500);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied("link");
    toast.success("Link copied");
    setTimeout(() => setCopied(null), 1500);
  };
  const share = async () => {
    const text = `Join my trip "${groupName}" on SplitTrip → ${url}\nCode: ${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join my trip", text, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    toast.success("Invite copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-8">Invite to {groupName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 pt-1">
          {qr ? (
            <img src={qr} alt="QR" className="h-40 w-40 rounded-xl border border-border bg-white p-2 sm:h-48 sm:w-48" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded-xl bg-secondary sm:h-48 sm:w-48" />
          )}
          <button
            onClick={copyCode}
            className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-base font-mono font-semibold tracking-[0.3em] hover:bg-accent sm:text-xl"
          >
            {code}
            {copied === "code" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button
            onClick={copyLink}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-secondary"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{url}</span>
            {copied === "link" ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Anyone who opens the link auto-joins. The owner approves their entry from the Members tab.
          </p>
          <Button onClick={share} className="w-full">Share invite</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
