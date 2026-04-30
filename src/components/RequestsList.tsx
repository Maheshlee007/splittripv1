import { Group } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { fmtMoney, relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Check, X, Inbox } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { toast } from "sonner";

export function RequestsList({ group }: { group: Group }) {
  const { approveRequest, rejectRequest, myRole } = useApp();
  const role = myRole(group.id);
  const isReviewer = role === "owner" || role === "admin";
  const memberName = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  const pending = group.requests.filter((r) => r.status === "pending");
  const reviewed = group.requests.filter((r) => r.status !== "pending");

  if (group.requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-7 w-7" />}
        title="No requests"
        description="Members can submit expenses they paid for separately. Admins approve them here."
      />
    );
  }

  const Row = (r: (typeof group.requests)[number]) => (
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
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            r.status === "pending"
              ? "bg-warning/15 text-warning"
              : r.status === "approved"
              ? "bg-success/15 text-success"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {r.status}
        </span>
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

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Pending ({pending.length})</h3>
          {pending.map(Row)}
        </div>
      )}
      {reviewed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">History</h3>
          {reviewed.map(Row)}
        </div>
      )}
    </div>
  );
}
