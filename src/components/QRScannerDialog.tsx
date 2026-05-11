import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function QRScannerDialog({ open, onOpenChange, onScan }: { open: boolean, onOpenChange: (v: boolean) => void, onScan: (url: string) => void }) {
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    
    let html5QrCode: Html5Qrcode;
    
    // Give the dialog content a moment to mount before initializing camera
    const timer = setTimeout(() => {
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          html5QrCode.stop().then(() => {
            onOpenChange(false);
            onScan(decodedText);
          }).catch(console.error);
        },
        () => {}
      ).catch((err) => {
        setError("Could not access camera. Please check permissions.");
        console.error(err);
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [open, onOpenChange, onScan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Trip QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center p-4">
          <div id="reader" className="w-full max-w-sm rounded-lg overflow-hidden bg-black/10"></div>
          {error && <p className="text-destructive mt-4 text-sm text-center">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
