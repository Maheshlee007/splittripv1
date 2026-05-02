import { useState } from "react";
import { Group, Expense } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { fmtMoney, relativeTime } from "@/lib/format";
import { computeShareAmount } from "@/lib/balances";
import { getCategory } from "@/lib/categories";
import { Trash2, Pencil, Receipt, Image as ImageIcon } from "lucide-react";
import { ExpenseDialog } from "./ExpenseDialog";
import { EmptyState } from "./EmptyState";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ExpensesList({ group }: { group: Group }) {
  const { profile, myRole, removeExpense, updateExpense } = useApp();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewBill, setViewBill] = useState<string | null>(null);
  const role = myRole(group.id);
  const canManage = role === "owner" || role === "admin";
  const memberName = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  if (group.expenses.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="No expenses yet"
        description="Tap the + button to log the first expense."
      />
    );
  }

  return (
    <>
      <div className="space-y-2">
        {group.expenses.map((e) => {
          const cat = getCategory(e.category);
          const Icon = cat.icon;
          const myShare = computeShareAmount(e.amount, e.splitMode, e.splits, profile.id);
          const isMyShare = e.splits.some((s) => s.memberId === profile.id);
          const isMine = e.createdBy === profile.id;
          // Only admins/owners can edit/delete; members can edit only their own (but delete is admin-only)
          const canEdit = canManage || isMine;
          const canDelete = canManage; // strict per request
          return (
            <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-card transition-shadow hover:shadow-elevated">
              <div className="flex items-start gap-3">
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: `${cat.color}22`, color: cat.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold">{e.description}</h4>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {memberName(e.paidBy)} paid · {e.splits.length}/{group.members.length} ppl · {relativeTime(e.createdAt)}
                    </span>
                    {isMyShare ? (
                      <span className="font-medium text-foreground tabular-nums">
                        your share: {fmtMoney(myShare, e.currency)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">not in split</span>
                    )}
                  </div>
                  {e.note && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.note}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {e.billImage && (
                      <button
                        onClick={() => setViewBill(e.billImage!)}
                        className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <ImageIcon className="h-3 w-3" /> Bill
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setEditing(e)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => { if (confirm("Delete this expense?")) removeExpense(group.id, e.id); }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ExpenseDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          group={group}
          initial={editing}
          title="Edit expense"
          saveLabel="Save changes"
          onSave={(payload) =>
            updateExpense(group.id, { ...editing, ...payload, updatedAt: Date.now() })
          }
        />
      )}

      <Dialog open={!!viewBill} onOpenChange={(o) => !o && setViewBill(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl p-2">
          {viewBill && <img src={viewBill} alt="Bill" className="max-h-[80vh] w-full rounded-lg object-contain bg-secondary" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
