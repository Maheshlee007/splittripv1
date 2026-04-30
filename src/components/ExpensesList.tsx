import { useState } from "react";
import { Group } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { fmtMoney, relativeTime } from "@/lib/format";
import { computeShareAmount } from "@/lib/balances";
import { getCategory } from "@/lib/categories";
import { Trash2, Pencil } from "lucide-react";
import { ExpenseDialog } from "./ExpenseDialog";
import { Expense } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { Receipt } from "lucide-react";

export function ExpensesList({ group }: { group: Group }) {
  const { profile, myRole, removeExpense, updateExpense } = useApp();
  const [editing, setEditing] = useState<Expense | null>(null);
  const role = myRole(group.id);
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
          const canEdit = role === "owner" || role === "admin" || e.createdBy === profile.id;
          return (
            <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-card">
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
                    <span className="shrink-0 font-semibold">{fmtMoney(e.amount, e.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {memberName(e.paidBy)} paid · {relativeTime(e.createdAt)}
                    </span>
                    {isMyShare && (
                      <span className="font-medium text-foreground">
                        your share: {fmtMoney(myShare, e.currency)}
                      </span>
                    )}
                  </div>
                  {e.note && <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>}
                  {canEdit && (
                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => setEditing(e)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete this expense?")) removeExpense(group.id, e.id); }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  )}
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
    </>
  );
}
