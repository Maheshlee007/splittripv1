import { forwardRef, useMemo, useRef, useState } from "react";
import { Expense, Group } from "@/lib/types";
import { buildExpenseBreakdownRows, buildMemberLedger, totalSpent, computeShareAmount, isAdvanceExpense, getExpenseKind } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { TrendingUp, Users, Receipt, Wallet, Banknote, Info, Share2, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useApp } from "@/store/AppStore";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { ExpenseDialog } from "./ExpenseDialog";

export const DashboardView = forwardRef<HTMLDivElement, { group: Group }>(({ group }, ref) => {
  const { updateExpense, removeExpense, myRole, profile } = useApp();
  const confirm = useConfirm();
  const role = myRole(group.id);
  const canManage = role === "owner" || role === "admin";
  const [editingAdvance, setEditingAdvance] = useState<Expense | null>(null);
  const advanceSectionRef = useRef<HTMLDivElement | null>(null);

  const total = totalSpent(group);
  const activeMembers = group.members.filter((m) => m.status !== "pending");
  const avg = activeMembers.length ? total / activeMembers.length : 0;

  const rows = useMemo(() => buildExpenseBreakdownRows(group), [group]);
  const ledger = useMemo(() => buildMemberLedger(group), [group]);
  const nonAdvanceSpentByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of activeMembers) map[m.id] = 0;
    for (const e of group.expenses) {
      if (isAdvanceExpense(e)) continue;
      map[e.paidBy] = (map[e.paidBy] ?? 0) + e.amount;
    }
    return map;
  }, [group.expenses, activeMembers]);
  const advanceByMember = useMemo(() => {
    const paidMap: Record<string, number> = {};
    const unpaidMap: Record<string, boolean> = {};
    const ownerExtraMap: Record<string, number> = {};
    for (const m of activeMembers) {
      paidMap[m.id] = 0;
      unpaidMap[m.id] = false;
      ownerExtraMap[m.id] = 0;
    }

    for (const e of group.expenses.filter((x) => isAdvanceExpense(x))) {
      let collected = 0;
      for (const s of e.splits) {
        const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
        const paidEntry = e.advancePayments?.find((a) => a.memberId === s.memberId);
        if (paidEntry?.hasPaid) {
          paidMap[s.memberId] = (paidMap[s.memberId] ?? 0) + share;
          collected += share;
        } else {
          unpaidMap[s.memberId] = true;
        }
      }
      ownerExtraMap[e.paidBy] = (ownerExtraMap[e.paidBy] ?? 0) + Math.max(0, e.amount - collected);
    }
    return { paidMap, unpaidMap, ownerExtraMap };
  }, [group.expenses, activeMembers]);

  // Group rows by date for rowspan
  const dateGroups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const d = new Date(r.date);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" });

  const shareAdvanceImage = async () => {
    if (!advanceSectionRef.current) return;
    try {
      const { toPng } = await import("html-to-image");
      const target = advanceSectionRef.current;
      const w = Math.max(target.scrollWidth, target.offsetWidth);
      const h = Math.max(target.scrollHeight, target.offsetHeight);
      const dataUrl = await toPng(target, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        width: w,
        height: h,
        canvasWidth: w,
        canvasHeight: h,
        style: { overflow: "visible", maxHeight: "none", maxWidth: "none", width: `${w}px`, height: `${h}px` },
      });

      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `${group.name.replace(/[^\w]+/g, "_")}_advance.png`, { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: `${group.name} advance payments`, files: [file] });
          return;
        }
      } catch {
        // fallback to download
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${group.name.replace(/[^\w]+/g, "_")}_advance.png`;
      a.click();
      toast.success("Share not available on this device. Downloaded image instead.");
    } catch {
      toast.error("Couldn't create advance image");
    }
  };

  return (
    <div ref={ref} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Total" value={fmtMoney(total, group.currency)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Avg / person" value={fmtMoney(avg, group.currency)} />
        <Stat icon={<Receipt className="h-4 w-4" />} label="Expenses" value={String(rows.length)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Active" value={String(activeMembers.length)} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-card sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Trip breakdown</h3>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary" aria-label="Calculation help">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] text-xs leading-relaxed">
                <p className="font-semibold">Balance formula</p>
                <p className="mt-1">Member balance = Individual spent + Total advance - Spent per person.</p>
                <p className="mt-1">Owner follows the same formula. Owner's "extra advance" means advance paid by owner that members have not yet marked as paid, and it is included in Total advance.</p>
                <p className="mt-1">Final balances also include verified settlement adjustments.</p>
              </PopoverContent>
            </Popover>
          </div>
          <span className="text-[10px] text-muted-foreground">share / spent / advance / balance · {group.currency}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No expenses yet.</p>
        ) : (
          <div data-capturable className="max-h-[70vh] overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-secondary text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Category / desc</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  {activeMembers.map((m) => (
                    <th key={m.id} className="px-2 py-2 text-right font-semibold">
                      <span className="inline-block max-w-[92px] truncate align-bottom" title={m.name}>{m.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dateGroups.map(([k, group2]) => (
                  group2.map((r, i) => {
                    const c = getCategory(r.category);
                    const Icon = c.icon;
                    return (
                      <tr key={`${k}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                        {i === 0 ? (
                          <td rowSpan={group2.length} className="border-r border-border/60 bg-secondary/20 px-2 py-2 align-top font-medium tabular-nums">
                            {fmtDay(r.date)}
                          </td>
                        ) : null}
                        <td className="px-2 py-2">
                          <span className="inline-flex items-start gap-1.5">
                            <span className="grid h-5 w-5 place-items-center rounded" style={{ background: `${c.color}22`, color: c.color }}>
                              <Icon className="h-3 w-3" />
                            </span>
                            <span><span className="font-medium">{c.label}</span><span className="block text-[10px] text-muted-foreground">{r.description}</span></span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.total, group.currency)}</td>
                        {activeMembers.map((m) => {
                          const v = r.shares[m.id] ?? 0;
                          return (
                            <td key={m.id} className={`px-2 py-2 text-right tabular-nums ${v > 0 ? "" : "text-muted-foreground/40"}`}>
                              {v > 0 ? fmtMoney(v, group.currency) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ))}
                <tr className="border-t-2 border-primary/30 bg-primary/5 font-semibold">
                  <td colSpan={2} className="px-2 py-2 text-right">Spent per person</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(total, group.currency)}</td>
                  {activeMembers.map((m) => <td key={m.id} className="px-2 py-2 text-right tabular-nums text-destructive">-{fmtMoney(ledger.find((r) => r.memberId === m.id)?.owed ?? 0, group.currency)}</td>)}
                </tr>
                <tr className="border-t border-border bg-secondary/30 font-semibold">
                  <td colSpan={2} className="px-2 py-2 text-right">Individual spent</td>
                  <td />
                  {activeMembers.map((m) => <td key={m.id} className="px-2 py-2 text-right tabular-nums text-success">+{fmtMoney(nonAdvanceSpentByMember[m.id] ?? 0, group.currency)}</td>)}
                </tr>
                <tr className="border-t border-border bg-secondary/40 font-semibold">
                  <td colSpan={2} className="px-2 py-2 text-right">Total advance</td>
                  <td />
                  {activeMembers.map((m) => {
                    const paid = advanceByMember.paidMap[m.id] ?? 0;
                    const unpaid = advanceByMember.unpaidMap[m.id] ?? false;
                    const extra = advanceByMember.ownerExtraMap[m.id] ?? 0;
                    return (
                      <td key={m.id} className="px-2 py-2 text-right tabular-nums">
                        {paid > 0 ? (
                          <span className="text-success">+{fmtMoney(paid, group.currency)}</span>
                        ) : unpaid ? (
                          <span className="text-destructive">Not paid</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {extra > 0 && (
                          <span className="block text-[10px] font-medium text-warning">extra {fmtMoney(extra, group.currency)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-border bg-secondary/60 font-bold">
                  <td colSpan={2} className="px-2 py-2 text-right">Balances</td>
                  <td />
                  {activeMembers.map((m) => {
                    const bal = ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0;
                    return <td key={m.id} className={`px-2 py-2 text-right tabular-nums ${bal > 0 ? "text-success" : bal < 0 ? "text-destructive" : "text-muted-foreground"}`}>{bal > 0 ? "+" : bal < 0 ? "-" : ""}{fmtMoney(Math.abs(bal), group.currency)}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Formula: Balance = Individual spent + Total advance - Spent per person.
          <span className="block">For owner, Total advance includes owner extra advance (advance not yet paid back by members).</span>
        </p>
      </section>

      {/* Advance Payments Section */}
      {group.expenses.some(e => isAdvanceExpense(e)) && (
        <section ref={advanceSectionRef} className="rounded-2xl border border-border bg-card p-3 shadow-card sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-success" />
              <h3 className="text-sm font-semibold">Advance Payments</h3>
            </div>
            <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" onClick={shareAdvanceImage}>
              <Share2 className="h-3.5 w-3.5" /> Share image
            </Button>
          </div>
          <div className="overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[620px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Description</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  {activeMembers.map((m) => (
                    <th key={m.id} className="px-2 py-2 text-center font-semibold">
                      <span className="inline-block max-w-[92px] truncate align-bottom" title={m.name}>{m.name}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.expenses.filter(e => isAdvanceExpense(e)).map((e) => {
                  const kind = getExpenseKind(e);
                  const isMine = e.createdBy === profile.id;
                  const canEdit = canManage || isMine;
                  return (
                    <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
                      <td className="px-2 py-2">
                        <span className="font-medium">{e.description}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {e.advancePayments?.filter(a => a.hasPaid).length ?? 0}/{e.advancePayments?.length ?? 0} collected
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-muted-foreground">{kind}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtMoney(e.amount, group.currency)}</td>
                      {activeMembers.map((m) => {
                        const ap = e.advancePayments?.find(a => a.memberId === m.id);
                        const share = computeShareAmount(e.amount, e.splitMode, e.splits, m.id);
                        const inSplit = e.splits.some(s => s.memberId === m.id);
                        if (!inSplit) return <td key={m.id} className="px-2 py-2 text-center text-muted-foreground/40">—</td>;
                        return (
                          <td key={m.id} className="px-2 py-2 text-center">
                            {ap?.hasPaid ? (
                              <span className="inline-flex flex-col items-center">
                                <span className="text-success font-semibold tabular-nums">{fmtMoney(share, group.currency)}</span>
                                <span className="text-[9px] text-success">✓ Paid</span>
                              </span>
                            ) : (
                              <span className="inline-flex flex-col items-center">
                                <span className="text-destructive font-semibold tabular-nums">0</span>
                                <span className="text-[9px] text-destructive">✗ Not paid</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2">
                        {canEdit ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingAdvance(e)}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await confirm({ title: "Delete this advance entry?", confirmText: "Delete", destructive: true });
                                if (ok) removeExpense(group.id, e.id);
                              }}
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editingAdvance && (
        <ExpenseDialog
          open={!!editingAdvance}
          onOpenChange={(o) => !o && setEditingAdvance(null)}
          group={group}
          initial={editingAdvance}
          title="Edit advance"
          saveLabel="Save changes"
          onSave={(payload) => updateExpense(group.id, { ...editingAdvance, ...payload, updatedAt: Date.now() })}
        />
      )}
    </div>
  );
});
DashboardView.displayName = "DashboardView";

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
