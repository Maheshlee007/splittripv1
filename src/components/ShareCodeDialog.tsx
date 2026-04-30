import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      QRCode.toDataURL(`splittrip:join?code=${code}`, { width: 280, margin: 1 })
        .then(setQr)
        .catch(() => setQr(""));
    }
  }, [open, code]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied");
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    const text = `Join my trip "${groupName}" on SplitTrip with code: ${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Join my trip", text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Invite copied");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {groupName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-2">
          {qr ? (
            <img src={qr} alt="QR" className="h-56 w-56 rounded-xl border border-border bg-white p-2" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-xl bg-secondary" />
          )}
          <button
            onClick={copy}
            className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-2xl font-mono font-semibold tracking-[0.35em] hover:bg-accent"
          >
            {code}
            {copied ? <Check className="h-5 w-5 text-success" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Share this code or QR with friends. They'll connect peer-to-peer; no data is stored on any server.
          </p>
          <Button onClick={share} className="w-full">Share invite</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
