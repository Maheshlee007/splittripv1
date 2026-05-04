import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import LZString from "lz-string";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createManualOffer, acceptManualOffer } from "@/lib/sync";
import { Camera, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Mode = "host" | "guest";

export function QRHandshakeDialog({
  open,
  onOpenChange,
  groupId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
}) {
  const [mode, setMode] = useState<Mode>("host");
  const [offerQR, setOfferQR] = useState("");
  const [offerStr, setOfferStr] = useState("");
  const [answerStr, setAnswerStr] = useState("");
  const [scannerOn, setScannerOn] = useState(false);
  const applyAnswerRef = useRef<((s: string) => Promise<void>) | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) {
      setOfferQR(""); setOfferStr(""); setAnswerStr(""); setScannerOn(false);
      applyAnswerRef.current = null;
      scannerRef.current?.stop().catch(() => {});
      return;
    }
    if (mode === "host") generateOffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const generateOffer = async () => {
    setOfferQR(""); setOfferStr("");
    try {
      const { sdp, applyAnswer } = await createManualOffer(groupId);
      applyAnswerRef.current = applyAnswer;
      const compressed = LZString.compressToEncodedURIComponent(sdp);
      const payload = `splittrip:o:${groupId}:${compressed}`;
      setOfferStr(payload);
      const qr = await QRCode.toDataURL(payload, { width: 280, margin: 1, errorCorrectionLevel: "L" });
      setOfferQR(qr);
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
    if (!text.startsWith("splittrip:a:")) { toast.error("Not an answer QR"); return; }
    const compressed = text.split(":").slice(3).join(":");
    const sdp = LZString.decompressFromEncodedURIComponent(compressed);
    if (!sdp) { toast.error("Bad QR data"); return; }
    try {
      await applyAnswerRef.current?.(sdp);
      toast.success("Connected!");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply answer");
    }
  };

  const handleScannedOffer = async (text: string) => {
    if (!text.startsWith("splittrip:o:")) { toast.error("Not an offer QR"); return; }
    const compressed = text.split(":").slice(3).join(":");
    const sdp = LZString.decompressFromEncodedURIComponent(compressed);
    if (!sdp) { toast.error("Bad QR data"); return; }
    try {
      const answer = await acceptManualOffer(groupId, sdp);
      const compressedA = LZString.compressToEncodedURIComponent(answer);
      const payload = `splittrip:a:${groupId}:${compressedA}`;
      setAnswerStr(payload);
      const qr = await QRCode.toDataURL(payload, { width: 280, margin: 1, errorCorrectionLevel: "L" });
      setOfferQR(qr);
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
          Use this when normal sync isn't connecting. Both phones must be online once for STUN; after that the connection is direct.
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
            {offerQR ? (
              <img src={offerQR} alt="Offer" className="mx-auto h-56 w-56 rounded-xl border bg-white p-2" />
            ) : (
              <div className="grid h-56 place-items-center rounded-xl bg-secondary text-xs text-muted-foreground">Generating…</div>
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
            {answerStr && offerQR ? (
              <img src={offerQR} alt="Answer" className="mx-auto h-56 w-56 rounded-xl border bg-white p-2" />
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
