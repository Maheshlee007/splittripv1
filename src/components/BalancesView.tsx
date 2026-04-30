import { useState } from "react";
import { ArrowRight, ExternalLink, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect } from "react";
import { Group } from "@/lib/types";
import { computeBalances, simplifyDebts } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/upi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/store/AppStore";
import { toast } from "sonner";

export function BalancesView({ group }: { group: Group }) {
  const { addSettlement } = useApp();
  const net = computeBalances(group);
  const transfers = simplifyDebts(net);
  const [qr, setQr] = useState<{ uri: string; data: string; t: any } | null>(null);

  const memberById = (id: string) => group.members.find((m) => m.id === id);

  const openUpi = (t: any) => {
    const creditor = memberById(t.toId);
    if (!creditor?.upiId) {
      toast.error(`${creditor?.name ?? "Member"} hasn't added a UPI ID`);
      return;
    }
    const link = buildUpiLink({
      vpa: creditor.upiId,
      name: creditor.name,
      amount: t.amount,
      note: `${group.name} settlement`,
      currency: group.currency,
    });
    window.location.href = link;
    setTimeout(() => toast("Opening UPI app…", { description: "Mark as paid once done." }), 200);
  };

  const showQr = async (t: any) => {
    const creditor = memberById(t.toId);
    if (!creditor?.upiId) { toast.error("No UPI ID set"); return; }
    const link = buildUpiLink({
      vpa: creditor.upiId, name: creditor.name, amount: t.amount,
      note: `${group.name} settlement`, currency: group.currency,
    });
    const data = await QRCode.toDataURL(link, { width: 280, margin: 1 });
    setQr({ uri: link, data, t });
  };

  const markPaid = (t: any) => {
    addSettlement(group.id, {
      fromId: t.fromId, toId: t.toId, amount: t.amount, currency: group.currency, note: "Marked paid",
    });
    toast.success("Settlement recorded");
    setQr(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-1">
        {group.members.map((m, i) => {
          const v = net[m.id] ?? 0;
          const positive = v > 0.01;
          const negative = v < -0.01;
          return (
            <div key={m.id} className={`flex items-center justify-between px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm">{m.name}</span>
              </div>
              <span className={`text-sm font-semibold ${positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground"}`}>
                {positive ? "+" : ""}{fmtMoney(v, group.currency)}
              </span>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Settle up ({transfers.length})</h3>
        {transfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            All settled up 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((t, i) => {
              const from = memberById(t.fromId)!;
              const to = memberById(t.toId)!;
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{from.name}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{to.name}</span>
                    </div>
                    <span className="font-semibold text-primary">{fmtMoney(t.amount, group.currency)}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="flex-1 gap-1.5" onClick={() => openUpi(t)}>
                      <ExternalLink className="h-3.5 w-3.5" /> Pay via UPI
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => showQr(t)}>
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markPaid(t)}>Mark paid</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Scan to pay</DialogTitle></DialogHeader>
          {qr && (
            <div className="flex flex-col items-center gap-3">
              <img src={qr.data} alt="UPI QR" className="h-64 w-64 rounded-xl border border-border bg-white p-2" />
              <p className="text-center text-sm text-muted-foreground">
                Open any UPI app, scan, and pay {fmtMoney(qr.t.amount, group.currency)} to {memberById(qr.t.toId)?.name}.
              </p>
              <Button className="w-full" onClick={() => markPaid(qr.t)}>Mark as paid</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
