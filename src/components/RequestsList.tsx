import { useState } from "react";
import { Group } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { fmtMoney, relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Inbox, Wallet, CheckCheck } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { toast } from "sonner";

export function RequestsList({ group }: { group: Group }) {
  const { approveRequest, rejectRequest, reviewClaim, approveLeave, myRole, profile } = useApp();
  const role = myRole(group.id);
  const isReviewer = role === "owner" || role === "admin";
  const memberName = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  const pending = group.requests.filter((r) => r.status === "pending");
  const reviewed = group.requests.filter((r) => r.status !== "pending");
  const claims = group.settlements.filter((s) => s.status); // any claim-flow settlements
  const pendingClaims = claims.filter((s) => s.status === "pending");
  const reviewedClaims = claims.filter((s) => s.status !== "pending");
  const leaveRequests = group.members.filter((m) => m.leaveRequested);

  const [partial, setPartial] = useState<Record<string, string>>({});

  const nothing =
    group.requests.length === 0 && claims.length === 0 && leaveRequests.length === 0;
  if (nothing) {
    return (
      <EmptyState
        icon={<Inbox className="h-7 w-7" />}
        title="No requests"
        description="Expense requests, payment verifications and leave requests will appear here."
      />
    );
  }

  const ExpenseRow = (r: (typeof group.requests)[number]) => (
    <div key={r.id} className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">{r.expense.description}</h4>
        <span className="font-semibold">{fmtMoney(r.expense.amount, r.expense.currency)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Requested by {memberName(r.requestedBy)} · {relativeTime(r.requestedAt)}
      </p>
      {r.expense.note && <p className="mt-1 text-xs">{r.expense.note}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          r.status === "pending" ? "bg-warning/15 text-warning" :
          r.status === "approved" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
        }`}>{r.status}</span>
        {r.status === "pending" && isReviewer && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => { rejectRequest(group.id, r.id); toast("Request rejected"); }}>
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button size="sm" onClick={() => { approveRequest(group.id, r.id); toast.success("Approved & added"); }}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  const ClaimRow = (s: (typeof group.settlements)[number]) => {
    const claimed = s.claimedAmount ?? s.amount;
    return (
      <div key={s.id} className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> {memberName(s.fromId)} → {memberName(s.toId)}
          </h4>
          <span className="font-semibold tabular-nums">{fmtMoney(claimed, s.currency)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Claimed {relativeTime(s.createdAt)}
          {s.status !== "pending" && s.reviewedAt && ` · reviewed ${relativeTime(s.reviewedAt)}`}
        </p>
        {s.note && <p className="mt-1 text-xs">{s.note}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            s.status === "pending" ? "bg-warning/15 text-warning" :
            s.status === "approved" ? "bg-success/15 text-success" :
            s.status === "partial" ? "bg-primary/15 text-primary" :
            "bg-destructive/15 text-destructive"
          }`}>
            {s.status}{s.status === "partial" && ` · ${fmtMoney(s.approvedAmount ?? 0, s.currency)}`}
          </span>
          {s.status === "pending" && (s.toId === profile.id || isReviewer) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                type="number"
                inputMode="decimal"
                placeholder={`Partial (${claimed})`}
                value={partial[s.id] ?? ""}
                onChange={(e) => setPartial((p) => ({ ...p, [s.id]: e.target.value }))}
                className="h-8 w-28 text-xs"
              />
              <Button size="sm" variant="ghost" onClick={() => { reviewClaim(group.id, s.id, { approve: false }); toast("Rejected"); }}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const v = parseFloat(partial[s.id] || "");
                if (!isFinite(v) || v <= 0 || v > claimed) { toast.error("Enter a valid partial amount"); return; }
                reviewClaim(group.id, s.id, { approve: true, amount: v });
                toast.success("Partial approved");
              }}>Partial</Button>
              <Button size="sm" onClick={() => { reviewClaim(group.id, s.id, { approve: true }); toast.success("Approved"); }}>
                <CheckCheck className="h-4 w-4" /> Full
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {pendingClaims.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Payment claims to verify ({pendingClaims.length})</h3>
          {pendingClaims.map(ClaimRow)}
        </div>
      )}
      {leaveRequests.length > 0 && isReviewer && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Leave requests ({leaveRequests.length})</h3>
          {leaveRequests.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{m.name}</p>
                <p className="text-xs text-muted-foreground">Wants to leave the trip</p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => { approveLeave(group.id, m.id); toast.success("Removed"); }}>
                Approve & remove
              </Button>
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Pending expense requests ({pending.length})</h3>
          {pending.map(ExpenseRow)}
        </div>
      )}
      {(reviewed.length > 0 || reviewedClaims.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">History</h3>
          {reviewed.map(ExpenseRow)}
          {reviewedClaims.map(ClaimRow)}
        </div>
      )}
    </div>
  );
}
