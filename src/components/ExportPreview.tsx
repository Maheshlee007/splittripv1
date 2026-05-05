import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Group } from "@/lib/types";
import { exportExcel, exportJSON, exportPDF, buildWhatsAppText, shareWhatsApp, exportImage, buildPDFBlobUrl, buildJSONString } from "@/lib/exports";
import { Download, Share2, Copy } from "lucide-react";
import { toast } from "sonner";

type Kind = "pdf" | "json" | "whatsapp" | "image" | null;

export function ExportPreview({
  open,
  onOpenChange,
  group,
  kind,
  imageNode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: Group;
  kind: Kind;
  imageNode?: HTMLElement | null;
}) {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [imgUrl, setImgUrl] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [json, setJson] = useState<string>("");

  useEffect(() => {
    if (!open || !kind) return;
    setPdfUrl(""); setImgUrl(""); setText(""); setJson("");

    if (kind === "pdf") {
      try { setPdfUrl(buildPDFBlobUrl(group)); } catch { toast.error("PDF preview failed"); }
    } else if (kind === "json") {
      setJson(buildJSONString(group));
    } else if (kind === "whatsapp") {
      setText(buildWhatsAppText(group));
    } else if (kind === "image" && imageNode) {
      import("html-to-image").then(({ toPng }) =>
        toPng(imageNode, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: getComputedStyle(document.body).backgroundColor,
          width: imageNode.scrollWidth,
          height: imageNode.scrollHeight,
          style: { overflow: "visible", maxHeight: "none" },
        })
          .then(setImgUrl)
          .catch(() => toast.error("Image render failed"))
      );
    }
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, group, imageNode]);

  const copyText = async (t: string) => {
    await navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[92vh] overflow-hidden p-3 sm:p-5">
        <DialogHeader>
          <DialogTitle className="capitalize pr-8">{kind} preview · {group.name}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-secondary/30">
          {kind === "pdf" && pdfUrl && (
            <object data={pdfUrl} type="application/pdf" className="h-[65vh] w-full bg-white">
              <div className="grid h-48 place-items-center p-4 text-center text-xs text-muted-foreground">
                PDF preview is blocked on this phone. Use Download PDF below.
              </div>
            </object>
          )}
          {kind === "image" && (
            imgUrl ? <img src={imgUrl} alt="preview" className="mx-auto max-w-none" /> :
            <div className="grid h-48 place-items-center text-xs text-muted-foreground">Rendering…</div>
          )}
          {kind === "whatsapp" && (
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed">{text}</pre>
          )}
          {kind === "json" && (
            <pre className="max-h-[65vh] overflow-auto whitespace-pre p-4 font-mono text-[11px]">{json}</pre>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {kind === "whatsapp" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => copyText(text)}><Copy className="h-4 w-4" /> Copy</Button>
              <Button size="sm" onClick={async () => { await shareWhatsApp(group); toast.success("Shared / copied"); }}>
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </>
          )}
          {kind === "json" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => copyText(json)}><Copy className="h-4 w-4" /> Copy</Button>
              <Button size="sm" onClick={() => exportJSON(group)}><Download className="h-4 w-4" /> Download</Button>
            </>
          )}
          {kind === "pdf" && (
            <Button size="sm" onClick={() => exportPDF(group)}><Download className="h-4 w-4" /> Download PDF</Button>
          )}
          {kind === "image" && imgUrl && (
            <Button size="sm" onClick={() => {
              const a = document.createElement("a"); a.href = imgUrl; a.download = `${group.name}_dashboard.png`; a.click();
            }}><Download className="h-4 w-4" /> Download PNG</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
