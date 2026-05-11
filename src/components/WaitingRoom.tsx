import { useState, useEffect } from "react";
import { Loader2, QrCode, Link2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRHandshakeDialog } from "./QRHandshakeDialog";
import { SyncStatus } from "@/hooks/useWebRTCSync";

interface WaitingRoomProps {
  status: SyncStatus;
  tripId: string;
  code: string;
  onContinueOffline?: () => void;
  hasLocalData: boolean;
}

export function WaitingRoom({ status, tripId, code, onContinueOffline, hasLocalData }: WaitingRoomProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    // Show offline option after 5 seconds of trying
    const t = setTimeout(() => setShowOffline(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const copyLink = () => {
    const url = `${window.location.origin}/?trip=${tripId}&code=${code}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-8 rounded-full bg-primary/10 p-6">
        {status === "failed" ? (
          <div className="h-12 w-12 text-destructive">❌</div>
        ) : (
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        )}
      </div>

      <h2 className="mb-2 text-2xl font-bold">
        {status === "failed" ? "Connection Failed" : "Establishing Secure Peer Connection..."}
      </h2>
      <p className="mb-8 max-w-sm text-muted-foreground">
        Waiting for the Host to become online. Real-time synchronization requires a direct peer-to-peer link.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button variant="outline" className="gap-2" onClick={copyLink}>
          <Link2 className="h-4 w-4" /> Copy Signaling Link
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => setQrOpen(true)}>
          <QrCode className="h-4 w-4" /> Manual QR Fallback
        </Button>
        
        {(showOffline && hasLocalData) && (
          <Button variant="ghost" className="mt-4 gap-2 text-muted-foreground" onClick={onContinueOffline}>
            Continue Offline <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <QRHandshakeDialog open={qrOpen} onOpenChange={setQrOpen} groupId={tripId} />
    </div>
  );
}
