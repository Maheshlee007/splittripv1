import { useMemo, useState } from "react";
import { Group, Expense } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { fmtMoney, relativeTime } from "@/lib/format";
import { computeShareAmount } from "@/lib/balances";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { Trash2, Pencil, Receipt, Image as ImageIcon, Search, X } from "lucide-react";
import { ExpenseDialog } from "./ExpenseDialog";
import { EmptyState } from "./EmptyState";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "./ConfirmDialog";
import { cn } from "@/lib/utils";

export function ExpensesList({ group }: { group: Group }) {
  const { profile, myRole, removeExpense, updateExpense } = useApp();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewBill, setViewBill] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const role = myRole(group.id);
  const canManage = role === "owner" || role === "admin";
  const memberName = (id: string) => group.members.find((m) => m.id === id)?.name ?? "?";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...group.expenses]
      .filter((e) => filterCat === "all" || e.category === filterCat)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q) || memberName(e.paidBy).toLowerCase().includes(q))
      .sort((a, b) => ((b as any).date ?? b.createdAt) - ((a as any).date ?? a.createdAt));
  }, [group.expenses, query, filterCat, group.members]);

  const dayKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });

  const dayGroups = useMemo(() => {
    const map = new Map<string, { ts: number; total: number; items: Expense[] }>();
    for (const e of filtered) {
      const ts = (e as any).date ?? e.createdAt;
      const k = dayKey(ts);
      if (!map.has(k)) map.set(k, { ts, total: 0, items: [] });
      const g = map.get(k)!;
      g.total += e.amount;
      g.items.push(e);
    }
    return [...map.values()];
  }, [filtered]);

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
      {/* Sticky search/filter bar */}
      <div className="sticky top-0 z-10 bg-background pb-2 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, note, paid by…" className="pl-8 pr-8" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilterCat("all")} className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", filterCat === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>All</button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = filterCat === c.id;
            return (
              <button key={c.id} onClick={() => setFilterCat(c.id)} className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                <Icon className="h-3 w-3" /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {dayGroups.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No expenses match.</p>
        )}
        {dayGroups.map((d, di) => (
          <div key={di} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fmtDay(d.ts)}</span>
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{fmtMoney(d.total, group.currency)}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {d.items.map((e) => {
              const cat = getCategory(e.category);
              const Icon = cat.icon;
              const myShare = computeShareAmount(e.amount, e.splitMode, e.splits, profile.id);
              const isMyShare = e.splits.some((s) => s.memberId === profile.id);
              const isMine = e.createdBy === profile.id;
              const canEdit = canManage || isMine;
              const canDelete = canManage;
              return (
                <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-card transition-shadow hover:shadow-elevated">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${cat.color}22`, color: cat.color }}>
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
                          <span className="font-medium text-foreground tabular-nums">your share: {fmtMoney(myShare, e.currency)}</span>
                        ) : (
                          <span className="text-muted-foreground italic">not in split</span>
                        )}
                      </div>
                      {e.note && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.note}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {e.billImage && (
                          <button onClick={() => setViewBill(e.billImage!)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                            <ImageIcon className="h-3 w-3" /> Bill
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => setEditing(e)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={async () => {
                              const ok = await confirm({ title: "Delete this expense?", confirmText: "Delete", destructive: true });
                              if (ok) removeExpense(group.id, e.id);
                            }}
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
          </div>
        ))}
      </div>

      {editing && (
        <ExpenseDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          group={group}
          initial={editing}
          title={canManage ? "Edit expense" : "Request edit"}
          saveLabel={canManage ? "Save changes" : "Request to add"}
          onSave={(payload) => updateExpense(group.id, { ...editing, ...payload, updatedAt: Date.now() })}
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
