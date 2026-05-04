import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, ExternalLink, QrCode } from "lucide-react";
import { Group } from "@/lib/types";
import { computeBalances } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/upi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/store/AppStore";
import { toast } from "sonner";

export function BalancesView({ group }: { group: Group }) {
  const { addSettlement, profile } = useApp();
  const net = computeBalances(group);
  const owner = group.members.find((m) => m.id === group.ownerId) ?? group.members[0];
  const isOwner = owner?.id === profile.id;
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<string>("");

  // Each member's net amount routed via the owner.
  // Negative net = member owes (in red, must pay owner). Positive net = owner owes them.
  const rows = useMemo(() => {
    return group.members
      .filter((m) => m.id !== owner?.id)
      .map((m) => ({ member: m, net: net[m.id] ?? 0 }));
  }, [group.members, net, owner?.id]);

  const myNet = net[profile.id] ?? 0;

  const showPayOwnerQR = async () => {
    if (!owner?.upiId) { toast.error("Owner hasn't added a UPI ID"); return; }
    const amount = Math.abs(Math.min(myNet, 0));
    const link = buildUpiLink({
      vpa: owner.upiId,
      name: owner.name,
      amount,
      note: `${group.name} settle`,
      currency: group.currency,
    });
    const data = await QRCode.toDataURL(link, { width: 280, margin: 1 });
    setQrData(data);
    setQrOpen(true);
  };

  const openUpi = () => {
    if (!owner?.upiId) { toast.error("Owner hasn't added a UPI ID"); return; }
    const amount = Math.abs(Math.min(myNet, 0));
    const link = buildUpiLink({
      vpa: owner.upiId, name: owner.name, amount,
      note: `${group.name} settle`, currency: group.currency,
    });
    window.location.href = link;
  };

  const markPaidToOwner = (memberId: string, amount: number) => {
    addSettlement(group.id, {
      fromId: memberId, toId: owner!.id, amount, currency: group.currency, note: "Paid to owner",
    });
    toast.success("Recorded");
  };

  return (
    <div className="space-y-4">
      {/* Self summary card */}
      {!isOwner && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          {myNet < -0.01 ? (
            <>
              <p className="text-xs text-muted-foreground">You owe to {owner?.name}</p>
              <p className="mt-1 text-2xl font-bold text-destructive tabular-nums">
                {fmtMoney(Math.abs(myNet), group.currency)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1 gap-1.5" onClick={openUpi}>
                  <ExternalLink className="h-4 w-4" /> Pay via UPI
                </Button>
                <Button variant="secondary" onClick={showPayOwnerQR}>
                  <QrCode className="h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={() => markPaidToOwner(profile.id, Math.abs(myNet))}>Mark paid</Button>
              </div>
            </>
          ) : myNet > 0.01 ? (
            <>
              <p className="text-xs text-muted-foreground">{owner?.name} owes you</p>
              <p className="mt-1 text-2xl font-bold text-success tabular-nums">+{fmtMoney(myNet, group.currency)}</p>
              <p className="mt-2 text-xs text-muted-foreground">The owner will settle this with you.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">You're all settled with the owner 🎉</p>
          )}
        </div>
      )}

      {/* Owner collect view */}
      {isOwner && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collect / Refund</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Members pay you their net dues; you pay back anyone who's in surplus. Show your UPI QR to others or use the per-row controls below.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between bg-secondary/50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Member</span>
          <span>Net to {owner?.name ?? "owner"}</span>
        </div>
        {rows.map((r, i) => {
          const owesOwner = r.net < -0.01;
          const ownerOwes = r.net > 0.01;
          return (
            <div key={r.member.id} className={`flex items-center justify-between gap-2 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold">
                  {r.member.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.member.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {owesOwner ? <span className="inline-flex items-center gap-1 text-destructive"><ArrowUp className="h-3 w-3" /> pays owner</span>
                      : ownerOwes ? <span className="inline-flex items-center gap-1 text-success"><ArrowDown className="h-3 w-3" /> owner pays</span>
                      : "settled"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold tabular-nums ${owesOwner ? "text-destructive" : ownerOwes ? "text-success" : "text-muted-foreground"}`}>
                  {fmtMoney(Math.abs(r.net), group.currency)}
                </span>
                {isOwner && owesOwner && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                    onClick={() => markPaidToOwner(r.member.id, Math.abs(r.net))}>
                    Got it
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No other members yet.</div>
        )}
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <DialogHeader><DialogTitle>Pay {owner?.name}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qrData && <img src={qrData} alt="UPI QR" className="h-64 w-64 rounded-xl border bg-white p-2" />}
            <p className="text-center text-xs text-muted-foreground">
              Scan from any UPI app. After paying, tap "Mark paid".
            </p>
            <Button className="w-full" onClick={() => { markPaidToOwner(profile.id, Math.abs(Math.min(myNet, 0))); setQrOpen(false); }}>
              Mark paid
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
