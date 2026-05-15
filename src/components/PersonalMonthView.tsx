import { useState, useMemo } from "react";
import { usePersonal } from "@/store/PersonalStore";
import { useApp } from "@/store/AppStore";
import { PersonalExpense } from "@/lib/types";
import { PersonalExpenseDialog } from "./PersonalExpenseDialog";
import { fmtMoney, relativeTime } from "@/lib/format";
import { getCategory, CATEGORIES } from "@/lib/categories";
import { getPaymentMethod, PAYMENT_METHODS, monthKeyFullLabel } from "@/lib/personal-utils";
import { Plus, Pencil, Trash2, Search, X, Image as ImageIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  monthKey: string;
}

export function PersonalMonthView({ monthKey }: Props) {
  const { getMonthExpenses, getCategoryBreakdown, getPaymentBreakdown, removeExpense } = usePersonal();
  const { profile } = useApp();
  const currency = profile.defaultCurrency ?? "INR";

  const expenses = useMemo(() => getMonthExpenses(monthKey), [getMonthExpenses, monthKey]);
  const catBreakdown = useMemo(() => getCategoryBreakdown(monthKey), [getCategoryBreakdown, monthKey]);
  const payBreakdown = useMemo(() => getPaymentBreakdown(monthKey), [getPaymentBreakdown, monthKey]);
  const monthTotal = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const exportCSV = () => {
    if (expenses.length === 0) return;
    const header = "Date,Description,Category,Payment Method,Amount,Note";
    const rows = expenses.map((e) => {
      const d = new Date(e.date).toLocaleDateString();
      const desc = `"${e.description.replace(/"/g, '""')}"`;
      const cat = getCategory(e.category).label;
      const pm = getPaymentMethod(e.paymentMethod).label;
      const note = e.note ? `"${e.note.replace(/"/g, '""')}"` : "";
      return `${d},${desc},${cat},${pm},${e.amount},${note}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `personal_expenses_${monthKey}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PersonalExpense | null>(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [viewBill, setViewBill] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses
      .filter((e) => filterCat === "all" || e.category === filterCat)
      .filter((e) => filterPay === "all" || e.paymentMethod === filterPay)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q));
  }, [expenses, query, filterCat, filterPay]);

  // Group by day
  const dayGroups = useMemo(() => {
    const map = new Map<string, { ts: number; total: number; items: PersonalExpense[] }>();
    for (const e of filtered) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, { ts: e.date, total: 0, items: [] });
      const g = map.get(key)!;
      g.total += e.amount;
      g.items.push(e);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }, [filtered]);

  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });

  // Top categories sorted
  const topCats = useMemo(() =>
    Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [catBreakdown]
  );

  return (
    <div className="space-y-4">
      {/* Month summary header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{monthKeyFullLabel(monthKey)}</h2>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tabular-nums">{fmtMoney(monthTotal, currency)}</span>
            {expenses.length > 0 && (
              <button onClick={exportCSV} className="grid h-7 w-7 place-items-center rounded-full hover:bg-secondary" title="Export CSV">
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{expenses.length} transaction{expenses.length !== 1 ? "s" : ""}</p>

        {/* Category breakdown mini bars */}
        {topCats.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {topCats.map(([catId, amt]) => {
              const cat = getCategory(catId);
              const pct = monthTotal > 0 ? (amt / monthTotal) * 100 : 0;
              return (
                <div key={catId} className="flex items-center gap-2 text-xs">
                  <cat.icon className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
                  <span className="w-16 truncate">{cat.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat.color }} />
                  </div>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">{fmtMoney(amt, currency)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Payment method breakdown */}
        {Object.keys(payBreakdown).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(payBreakdown).sort((a, b) => b[1] - a[1]).map(([pmId, amt]) => {
              const pm = getPaymentMethod(pmId as any);
              return (
                <span key={pmId} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                  <pm.icon className="h-3 w-3" /> {pm.label}: {fmtMoney(amt, currency)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search expenses…" className="pl-8 pr-8" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilterPay("all")} className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", filterPay === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>All methods</button>
          {PAYMENT_METHODS.map((m) => {
            const Icon = m.icon;
            const active = filterPay === m.id;
            return (
              <button key={m.id} onClick={() => setFilterPay(m.id)} className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                <Icon className="h-3 w-3" /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expense list grouped by day */}
      <div className="space-y-3">
        {dayGroups.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">No expenses {expenses.length > 0 ? "match your filters" : "this month"}.</p>
        )}
        {dayGroups.map((d) => (
          <div key={d.ts} className="space-y-1.5">
            <div className="flex items-baseline justify-between border-b border-border/60 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fmtDay(d.ts)}</span>
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{fmtMoney(d.total, currency)}</span>
            </div>
            {d.items.map((e) => {
              const cat = getCategory(e.category);
              const pm = getPaymentMethod(e.paymentMethod);
              const Icon = cat.icon;
              const PMIcon = pm.icon;
              return (
                <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${cat.color}22`, color: cat.color }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="truncate text-sm font-semibold">{e.description}</h4>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(e.amount, currency)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-0.5"><PMIcon className="h-3 w-3" /> {pm.label}</span>
                        <span>·</span>
                        <span>{relativeTime(e.date)}</span>
                      </div>
                      {e.note && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{e.note}</p>}
                      <div className="mt-1.5 flex items-center gap-1">
                        {e.billImage && (
                          <button onClick={() => setViewBill(e.billImage!)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                            <ImageIcon className="h-3 w-3" /> Bill
                          </button>
                        )}
                        <button onClick={() => setEditing(e)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button onClick={() => removeExpense(e.id)} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* FAB to add */}
      <Button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 h-12 w-12 rounded-full shadow-elevated p-0"
      >
        <Plus className="h-5 w-5" />
      </Button>

      {/* Add/Edit dialog */}
      {showAdd && (
        <PersonalExpenseDialog open={showAdd} onOpenChange={setShowAdd} defaultCurrency={currency} />
      )}
      {editing && (
        <PersonalExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing} defaultCurrency={currency} />
      )}

      {/* Bill view */}
      <Dialog open={!!viewBill} onOpenChange={(o) => !o && setViewBill(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl p-2">
          {viewBill && <img src={viewBill} alt="Bill" className="max-h-[80vh] w-full rounded-lg object-contain bg-secondary" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
