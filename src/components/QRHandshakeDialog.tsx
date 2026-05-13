import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import LZString from "lz-string";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createOfflineOffer, acceptOfflineOffer } from "@/lib/offline-sync";
import { Camera, RefreshCw, ClipboardPaste, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/store/AppStore";

type Mode = "host" | "guest";

function buildUrl(groupId: string, inviteToken: string | undefined, kind: "o" | "a", sdp: string) {
  const compressed = LZString.compressToEncodedURIComponent(sdp);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
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

/** Try to parse raw SDP JSON (for paste fallback) */
function parseRawSdp(text: string): string | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && (parsed.type === "offer" || parsed.type === "answer") && parsed.sdp) {
      return text.trim();
    }
    return null;
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
  const [sdpText, setSdpText] = useState("");
  const [copied, setCopied] = useState(false);
  const [rawOffer, setRawOffer] = useState("");
  const applyAnswerRef = useRef<((s: string) => Promise<void>) | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { handleRemoteGroup, handleRemoteKick, setBroadcaster, setKickCaster } = useApp();

  const cb = { onRemoteGroup: handleRemoteGroup, onRemoteKick: handleRemoteKick, setBroadcaster, setKickCaster };

  useEffect(() => {
    if (!open) {
      setQrImg(""); setScannerOn(false); setSdpText(""); setCopied(false); setRawOffer("");
      applyAnswerRef.current = null;
      scannerRef.current?.stop().catch(() => {});
      return;
    }
    setQrImg(""); setSdpText(""); setCopied(false); setRawOffer("");
    setScannerOn(false);
    if (mode === "host") generateOffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const generateOffer = async () => {
    setQrImg("");
    setSdpText("");
    try {
      const { sdp, applyAnswer } = await createOfflineOffer(groupId, cb);
      applyAnswerRef.current = applyAnswer;
      setRawOffer(sdp);
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
    // Try URL format first, then raw SDP JSON
    const parsed = parseUrl(text);
    if (parsed && parsed.kind === "a") {
      try {
        await applyAnswerRef.current?.(parsed.sdp);
        toast.success("Connected!");
        onOpenChange(false);
        return;
      } catch (e: any) {
        toast.error(e?.message || "Failed to apply answer");
        return;
      }
    }
    const raw = parseRawSdp(text);
    if (raw) {
      try {
        await applyAnswerRef.current?.(raw);
        toast.success("Connected!");
        onOpenChange(false);
        return;
      } catch (e: any) {
        toast.error(e?.message || "Failed to apply answer");
        return;
      }
    }
    toast.error("Not a valid answer QR or SDP");
  };

  const handleScannedOffer = async (text: string) => {
    const parsed = parseUrl(text);
    let offerSdp: string | null = null;
    if (parsed && parsed.kind === "o") {
      offerSdp = parsed.sdp;
    } else {
      offerSdp = parseRawSdp(text);
    }
    if (!offerSdp) { toast.error("Not a valid offer QR or SDP"); return; }
    try {
      const answer = await acceptOfflineOffer(groupId, offerSdp, cb);
      setSdpText(answer);
      const url = buildUrl(groupId, inviteToken, "a", answer);
      const qr = await QRCode.toDataURL(url, { width: 300, margin: 1, errorCorrectionLevel: "L" });
      setQrImg(qr);
      toast.success("Show this QR back to the host");
    } catch (e: any) {
      toast.error(e?.message || "Failed to accept offer");
    }
  };

  const handlePasteAnswer = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast.error("Clipboard is empty"); return; }
      await handleScannedAnswer(text.trim());
    } catch {
      toast.error("Couldn't read clipboard");
    }
  };

  const handlePasteOffer = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast.error("Clipboard is empty"); return; }
      await handleScannedOffer(text.trim());
    } catch {
      toast.error("Couldn't read clipboard");
    }
  };

  const copyOffer = async () => {
    if (!rawOffer) return;
    await navigator.clipboard.writeText(rawOffer);
    setCopied(true);
    toast.success("Offer SDP copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAnswer = async () => {
    if (!sdpText) return;
    await navigator.clipboard.writeText(sdpText);
    setCopied(true);
    toast.success("Answer SDP copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect via QR / SDP (offline)</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Use this when normal sync isn't connecting. Scan a QR or paste the SDP text directly for manual connection.
          <br /><span className="font-medium text-warning">Note:</span> QR pairing connects one member at a time. Both devices must be nearby.
        </p>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="host">I'm the host</TabsTrigger>
            <TabsTrigger value="guest">I'm joining</TabsTrigger>
          </TabsList>
          <TabsContent value="host" className="space-y-3 pt-3">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Show this QR or share the SDP text to the joiner.</li>
              <li>They scan/paste it & show you their answer QR/text.</li>
              <li>Tap "Scan answer" or "Paste answer" below.</li>
            </ol>
            {qrImg ? (
              <img src={qrImg} alt="Offer QR" className="mx-auto h-52 w-52 rounded-xl border bg-white p-2 sm:h-60 sm:w-60" />
            ) : (
              <div className="grid h-52 place-items-center rounded-xl bg-secondary text-xs text-muted-foreground sm:h-60">Generating…</div>
            )}
            {rawOffer && (
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={copyOffer}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy offer SDP (for paste)"}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={generateOffer}><RefreshCw className="h-3.5 w-3.5" /> Regenerate</Button>
              <Button size="sm" className="ml-auto gap-1" onClick={() => startScanner(handleScannedAnswer)}>
                <Camera className="h-3.5 w-3.5" /> Scan answer
              </Button>
            </div>
            <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={handlePasteAnswer}>
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste answer SDP
            </Button>
          </TabsContent>
          <TabsContent value="guest" className="space-y-3 pt-3">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Scan host's QR or paste their SDP text.</li>
              <li>Show the generated answer QR back to the host (or copy & send).</li>
            </ol>
            {qrImg ? (
              <>
                <img src={qrImg} alt="Answer QR" className="mx-auto h-52 w-52 rounded-xl border bg-white p-2 sm:h-60 sm:w-60" />
                {sdpText && (
                  <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={copyAnswer}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy answer SDP (for paste)"}
                  </Button>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Button size="sm" className="w-full gap-1" onClick={() => startScanner(handleScannedOffer)}>
                  <Camera className="h-4 w-4" /> Scan host's offer QR
                </Button>
                <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={handlePasteOffer}>
                  <ClipboardPaste className="h-3.5 w-3.5" /> Paste host's offer SDP
                </Button>
              </div>
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
