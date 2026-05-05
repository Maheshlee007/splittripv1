import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, ExternalLink, QrCode, Wallet } from "lucide-react";
import { Group } from "@/lib/types";
import { buildMemberLedger } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/upi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/store/AppStore";
import { toast } from "sonner";

export function BalancesView({ group }: { group: Group }) {
  const { addSettlement, profile } = useApp();
  const owner = group.members.find((m) => m.id === group.ownerId) ?? group.members[0];
  const isOwner = owner?.id === profile.id;
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<string>("");

  const ledger = useMemo(() => buildMemberLedger(group), [group]);
  const rows = useMemo(() => ledger.filter((r) => r.memberId !== owner?.id), [ledger, owner?.id]);
  const owesOwner = rows.filter((r) => r.finalBalance < -0.01);
  const ownerPays = rows.filter((r) => r.finalBalance > 0.01);
  const myRow = ledger.find((r) => r.memberId === profile.id);
  const myNet = myRow?.finalBalance ?? 0;

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
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Total paid" value={fmtMoney(myRow?.paid ?? 0, group.currency)} />
        <Metric label="Your share" value={fmtMoney(myRow?.owed ?? 0, group.currency)} />
        <Metric label="Balance" value={`${myNet > 0 ? "+" : myNet < 0 ? "-" : ""}${fmtMoney(Math.abs(myNet), group.currency)}`} tone={myNet > 0 ? "good" : myNet < 0 ? "bad" : "muted"} />
      </div>

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

      {isOwner && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collect / Refund</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Balances are calculated as individual paid minus individual share. Negative members pay {owner?.name}; positive members receive extra spent from {owner?.name}.
          </p>
        </div>
      )}

      <BalanceSection title={`Members pay ${owner?.name ?? "owner"}`} icon={<ArrowUp className="h-4 w-4" />} rows={owesOwner} group={group} ownerName={owner?.name} isOwner={isOwner} onMark={markPaidToOwner} />
      <BalanceSection title={`${owner?.name ?? "Owner"} pays extra spent`} icon={<ArrowDown className="h-4 w-4" />} rows={ownerPays} group={group} ownerName={owner?.name} isOwner={isOwner} onMark={(memberId, amount) => markOwnerPaid(memberId, amount)} positive />

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

  function markOwnerPaid(memberId: string, amount: number) {
    addSettlement(group.id, {
      fromId: owner!.id, toId: memberId, amount, currency: group.currency, note: "Owner refunded extra spent",
    });
    toast.success("Recorded");
  }
}

function Metric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function BalanceSection({ title, icon, rows, group, ownerName, isOwner, onMark, positive = false }: any) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 bg-secondary/50 px-3 py-2 text-xs font-semibold">
        {icon} {title} <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">No pending amount.</div>
      ) : rows.map((r: any, i: number) => (
        <div key={r.memberId} className={`grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{r.name}</div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              paid {fmtMoney(r.paid, group.currency)} · share {fmtMoney(r.owed, group.currency)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold tabular-nums ${positive ? "text-success" : "text-destructive"}`}>
              {fmtMoney(Math.abs(r.finalBalance), group.currency)}
            </span>
            {isOwner && <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onMark(r.memberId, Math.abs(r.finalBalance))}>{positive ? "Paid" : "Got it"}</Button>}
          </div>
          <div className="col-span-2 text-[10px] text-muted-foreground">
            {positive ? `${ownerName} should send this extra-spent amount.` : `This member should pay ${ownerName}.`}
          </div>
        </div>
      ))}
    </div>
  );
}
