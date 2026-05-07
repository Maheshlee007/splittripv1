import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, ExternalLink, QrCode, Wallet, Clock } from "lucide-react";
import { Group, Member } from "@/lib/types";
import { buildMemberLedger } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { buildUpiLink } from "@/lib/upi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/store/AppStore";
import { toast } from "sonner";

export function BalancesView({ group }: { group: Group }) {
  const { addSettlement, claimPayment, profile } = useApp();
  const owner = group.members.find((m) => m.id === group.ownerId) ?? group.members[0];
  const isOwner = owner?.id === profile.id;
  const [qr, setQr] = useState<{ data: string; member: Member; amount: number } | null>(null);

  const ledger = useMemo(() => buildMemberLedger(group), [group]);
  const rows = useMemo(() => ledger.filter((r) => r.memberId !== owner?.id), [ledger, owner?.id]);
  const owesOwner = rows.filter((r) => r.finalBalance < -0.01);
  const ownerPays = rows.filter((r) => r.finalBalance > 0.01);
  const myRow = ledger.find((r) => r.memberId === profile.id);
  const myNet = myRow?.finalBalance ?? 0;

  const pendingByMember = (memberId: string) =>
    group.settlements.filter((s) => s.status === "pending" && s.fromId === memberId);

  const showQR = async (member: Member, amount: number) => {
    if (!member.upiId) { toast.error(`${member.name} hasn't added a UPI ID`); return; }
    const link = buildUpiLink({ vpa: member.upiId, name: member.name, amount, note: `${group.name} settle`, currency: group.currency });
    const data = await QRCode.toDataURL(link, { width: 280, margin: 1 });
    setQr({ data, member, amount });
  };

  const openUpi = (member: Member, amount: number) => {
    if (!member.upiId) { toast.error(`${member.name} hasn't added a UPI ID`); return; }
    const link = buildUpiLink({ vpa: member.upiId, name: member.name, amount, note: `${group.name} settle`, currency: group.currency });
    window.location.href = link;
  };

  /** Member taps "Mark as paid" → owner verifies. */
  const claimMyPayment = (amount: number) => {
    claimPayment(group.id, {
      fromId: profile.id, toId: owner!.id, amount, currency: group.currency, note: "Member marked as paid",
    });
    toast.success("Sent for owner verification");
  };

  /** Owner refunds extra-spent to a member directly (no claim needed). */
  const ownerRefund = (memberId: string, amount: number) => {
    addSettlement(group.id, {
      fromId: owner!.id, toId: memberId, amount, currency: group.currency, note: "Owner refunded extra spent",
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
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="flex-1 gap-1.5 min-w-[120px]" onClick={() => owner && openUpi(owner, Math.abs(myNet))}>
                  <ExternalLink className="h-4 w-4" /> Pay via UPI
                </Button>
                <Button variant="secondary" onClick={() => owner && showQR(owner, Math.abs(myNet))}>
                  <QrCode className="h-4 w-4" /> QR
                </Button>
                <Button variant="ghost" onClick={() => claimMyPayment(Math.abs(myNet))}>Mark as paid</Button>
              </div>
              {pendingByMember(profile.id).length > 0 && (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-warning"><Clock className="h-3 w-3" /> Awaiting owner verification</p>
              )}
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
            Negative members pay you. Positive members are owed extra spent. When a member taps "Mark as paid", verify it from the Requests tab — only verified amounts affect balances.
          </p>
        </div>
      )}

      <BalanceSection
        title={`Members pay ${owner?.name ?? "owner"}`}
        icon={<ArrowUp className="h-4 w-4" />}
        rows={owesOwner}
        group={group}
        owner={owner}
        isOwner={isOwner}
        onUpi={(m, amt) => openUpi(owner!, amt)}
        onQr={(m, amt) => showQR(owner!, amt)}
        pendingFor={pendingByMember}
      />
      <BalanceSection
        title={`${owner?.name ?? "Owner"} pays extra spent`}
        icon={<ArrowDown className="h-4 w-4" />}
        rows={ownerPays}
        group={group}
        owner={owner}
        isOwner={isOwner}
        positive
        onUpi={(m, amt) => openUpi(m, amt)}
        onQr={(m, amt) => showQR(m, amt)}
        onRefund={ownerRefund}
        pendingFor={pendingByMember}
      />

      <Dialog open={!!qr} onOpenChange={(v) => !v && setQr(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <DialogHeader><DialogTitle>Pay {qr?.member.name}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qr?.data && <img src={qr.data} alt="UPI QR" className="h-64 w-64 rounded-xl border bg-white p-2" />}
            <p className="text-center text-xs text-muted-foreground">
              Scan from any UPI app. After paying, tap "Mark as paid" so the owner can verify.
            </p>
            {!isOwner && qr && (
              <Button className="w-full" onClick={() => { claimMyPayment(qr.amount); setQr(null); }}>
                Mark as paid
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone = "muted" }: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  rows: ReturnType<typeof buildMemberLedger>;
  group: Group;
  owner?: Member;
  isOwner: boolean;
  positive?: boolean;
  onUpi: (m: Member, amt: number) => void;
  onQr: (m: Member, amt: number) => void;
  onRefund?: (memberId: string, amt: number) => void;
  pendingFor: (memberId: string) => Group["settlements"];
}
function BalanceSection({ title, icon, rows, group, owner, isOwner, positive = false, onUpi, onQr, onRefund, pendingFor }: SectionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 bg-secondary/50 px-3 py-2 text-xs font-semibold">
        {icon} {title} <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">No pending amount.</div>
      ) : rows.map((r, i) => {
        const member = group.members.find((m) => m.id === r.memberId);
        if (!member) return null;
        const pending = pendingFor(r.memberId);
        const amt = Math.abs(r.finalBalance);
        return (
          <div key={r.memberId} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                paid {fmtMoney(r.paid, group.currency)} · share {fmtMoney(r.owed, group.currency)}
              </div>
              {pending.length > 0 && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-warning">
                  <Clock className="h-3 w-3" /> claimed {fmtMoney(pending.reduce((a, s) => a + (s.claimedAmount ?? 0), 0), group.currency)} (pending)
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold tabular-nums ${positive ? "text-success" : "text-destructive"}`}>
                {fmtMoney(amt, group.currency)}
              </span>
            </div>
            <div className="ml-auto flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {positive ? (
                <>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => onUpi(member, amt)}>
                    <ExternalLink className="h-3.5 w-3.5" /> UPI
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => onQr(member, amt)}>
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </Button>
                  {isOwner && onRefund && (
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => onRefund(r.memberId, amt)}>
                      Mark refunded
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {owner?.upiId && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => onUpi(owner, amt)}>
                        <ExternalLink className="h-3.5 w-3.5" /> UPI
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => onQr(owner, amt)}>
                        <QrCode className="h-3.5 w-3.5" /> QR
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
