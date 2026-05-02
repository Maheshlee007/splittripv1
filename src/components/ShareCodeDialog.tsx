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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {groupName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-2">
          {qr ? (
            <img src={qr} alt="QR" className="h-48 w-48 rounded-xl border border-border bg-white p-2" />
          ) : (
            <div className="h-48 w-48 animate-pulse rounded-xl bg-secondary" />
          )}
          <button
            onClick={copyCode}
            className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-xl font-mono font-semibold tracking-[0.35em] hover:bg-accent"
          >
            {code}
            {copied === "code" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button
            onClick={copyLink}
            className="flex w-full items-center gap-2 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-secondary"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-left">{url}</span>
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
