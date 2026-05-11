import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import LZString from "lz-string";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createOfflineOffer, acceptOfflineOffer } from "@/lib/offline-sync";
import { Camera, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/store/AppStore";

type Mode = "host" | "guest";

function buildUrl(groupId: string, inviteToken: string | undefined, kind: "o" | "a", sdp: string) {
  const compressed = LZString.compressToEncodedURIComponent(sdp);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Keeping URL short: trip + code + sdp. The trip code IS the symmetric key.
  return `${origin}/?trip=${groupId}&code=${inviteToken || ""}&kind=${kind}&sdp=${compressed}`;
}
function parseUrl(text: string): { kind: "o" | "a"; sdp: string } | null {
  try {
    const u = new URL(text);
    const sdp = u.searchParams.get("sdp");
    const kind = u.searchParams.get("kind") as "o" | "a" | null;
    if (!sdp || (kind !== "o" && kind !== "a")) return null;
    const decoded = LZString.decompressFromEncodedURIComponent(sdp);
    if (!decoded) return null;
    return { kind, sdp: decoded };
  } catch { return null; }
}

export function QRHandshakeDialog({
  open,
  onOpenChange,
  groupId,
  inviteToken,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  inviteToken?: string;
}) {
  const [mode, setMode] = useState<Mode>("host");
  const [qrImg, setQrImg] = useState("");
  const [scannerOn, setScannerOn] = useState(false);
  const applyAnswerRef = useRef<((s: string) => Promise<void>) | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { handleRemoteGroup, handleRemoteKick, setBroadcaster, setKickCaster } = useApp();

  const cb = { onRemoteGroup: handleRemoteGroup, onRemoteKick: handleRemoteKick, setBroadcaster, setKickCaster };

  useEffect(() => {
    if (!open) {
      setQrImg(""); setScannerOn(false);
      applyAnswerRef.current = null;
      scannerRef.current?.stop().catch(() => {});
      return;
    }
    setQrImg("");
    setScannerOn(false);
    if (mode === "host") generateOffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const generateOffer = async () => {
    setQrImg("");
    try {
      const { sdp, applyAnswer } = await createOfflineOffer(groupId, cb);
      applyAnswerRef.current = applyAnswer;
      const url = buildUrl(groupId, inviteToken, "o", sdp);
      const qr = await QRCode.toDataURL(url, { width: 300, margin: 1, errorCorrectionLevel: "L" });
      setQrImg(qr);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't create offer");
    }
  };

  const startScanner = async (onText: (text: string) => void) => {
    try {
      setScannerOn(true);
      await new Promise((r) => setTimeout(r, 50));
      const id = "qr-scan-region";
      const inst = new Html5Qrcode(id, { verbose: false });
      scannerRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (text) => {
          onText(text);
          inst.stop().catch(() => {});
          setScannerOn(false);
        },
        () => {}
      );
    } catch {
      toast.error("Couldn't start camera");
      setScannerOn(false);
    }
  };

  const handleScannedAnswer = async (text: string) => {
    const parsed = parseUrl(text);
    if (!parsed || parsed.kind !== "a") { toast.error("Not an answer QR"); return; }
    try {
      await applyAnswerRef.current?.(parsed.sdp);
      toast.success("Connected!");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply answer");
    }
  };

  const handleScannedOffer = async (text: string) => {
    const parsed = parseUrl(text);
    if (!parsed || parsed.kind !== "o") { toast.error("Not an offer QR"); return; }
    try {
      const answer = await acceptOfflineOffer(groupId, parsed.sdp, cb);
      const url = buildUrl(groupId, inviteToken, "a", answer);
      const qr = await QRCode.toDataURL(url, { width: 300, margin: 1, errorCorrectionLevel: "L" });
      setQrImg(qr);
      toast.success("Show this QR back to the host");
    } catch (e: any) {
      toast.error(e?.message || "Failed to accept offer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect via QR (offline)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Use this when normal sync isn't connecting. The QR contains a deep-link to the app — Google Lens / iOS Camera will open it directly.
        </p>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="host">I'm the host</TabsTrigger>
            <TabsTrigger value="guest">I'm joining</TabsTrigger>
          </TabsList>
          <TabsContent value="host" className="space-y-3 pt-3">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Show this QR to the joiner.</li>
              <li>They scan it & show you their answer QR.</li>
              <li>Tap "Scan answer" below.</li>
            </ol>
            {qrImg ? (
              <img src={qrImg} alt="Offer QR" className="mx-auto h-60 w-60 rounded-xl border bg-white p-2" />
            ) : (
              <div className="grid h-60 place-items-center rounded-xl bg-secondary text-xs text-muted-foreground">Generating…</div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={generateOffer}><RefreshCw className="h-3.5 w-3.5" /> Regenerate</Button>
              <Button size="sm" className="ml-auto gap-1" onClick={() => startScanner(handleScannedAnswer)}>
                <Camera className="h-3.5 w-3.5" /> Scan answer
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="guest" className="space-y-3 pt-3">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Tap "Scan offer" and scan host's QR.</li>
              <li>Show the generated answer QR back to the host.</li>
            </ol>
            {qrImg ? (
              <img src={qrImg} alt="Answer QR" className="mx-auto h-60 w-60 rounded-xl border bg-white p-2" />
            ) : (
              <Button size="sm" className="w-full gap-1" onClick={() => startScanner(handleScannedOffer)}>
                <Camera className="h-4 w-4" /> Scan host's offer
              </Button>
            )}
          </TabsContent>
        </Tabs>
        {scannerOn && (
          <div id="qr-scan-region" className="overflow-hidden rounded-xl border" style={{ width: "100%", minHeight: 280 }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
