import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePersonal } from "@/store/PersonalStore";
import { useApp } from "@/store/AppStore";
import { PersonalExpenseDialog } from "@/components/PersonalExpenseDialog";
import { PageHeader } from "@/components/PageHeader";
import { fmtMoney, relativeTime } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { getPaymentMethod, deriveMonthKey } from "@/lib/personal-utils";
import { Plus, TrendingUp, ArrowRight, ArrowDownLeft, ArrowUpRight, Wallet, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function PersonalDashboardPage() {
  const { expenses, lendings, getMonthExpenses, getCategoryBreakdown, getPaymentBreakdown, getMonthTotal, getExcludedBreakdown } = usePersonal();
  const { profile } = useApp();
  const navigate = useNavigate();
  const currency = profile.defaultCurrency ?? "INR";

  const currentMonthKey = deriveMonthKey(Date.now());
  const monthExpenses = useMemo(() => getMonthExpenses(currentMonthKey), [getMonthExpenses, currentMonthKey]);
  /** Counted spend — excludes categories flagged "don't count in totals" (e.g. CC Paid). */
  const monthTotal = useMemo(() => getMonthTotal(currentMonthKey), [getMonthTotal, currentMonthKey]);
  const excludedTotal = useMemo(
    () => Object.values(getExcludedBreakdown(currentMonthKey)).reduce((a, b) => a + b, 0),
    [getExcludedBreakdown, currentMonthKey]
  );
  const catBreakdown = useMemo(() => getCategoryBreakdown(currentMonthKey), [getCategoryBreakdown, currentMonthKey]);
  const payBreakdown = useMemo(() => getPaymentBreakdown(currentMonthKey), [getPaymentBreakdown, currentMonthKey]);
  const recentAll = useMemo(() => [...monthExpenses].sort((a, b) => b.date - a.date).slice(0, 10), [monthExpenses]);

  const topCats = useMemo(() => Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6), [catBreakdown]);

  // Lending summary
  const pendingLendings = useMemo(() => lendings.filter((l) => l.status !== "settled"), [lendings]);
  const owedToMe = useMemo(() => pendingLendings.filter((l) => l.direction === "owed_to_me").reduce((s, l) => s + l.amount - (l.partialAmount ?? 0), 0), [pendingLendings]);
  const iOwe = useMemo(() => pendingLendings.filter((l) => l.direction === "i_owe").reduce((s, l) => s + l.amount - (l.partialAmount ?? 0), 0), [pendingLendings]);

  const [showAdd, setShowAdd] = useState(false);

  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Personal" subtitle={monthLabel} actions={
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      } />

      <div className="px-4 py-5 md:px-6 lg:px-8">
        {/* Top summary cards — responsive grid */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {/* Total Spend */}
          <div className="col-span-2 md:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="uppercase tracking-wider font-medium">This Month</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{fmtMoney(monthTotal, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {monthExpenses.length} transaction{monthExpenses.length !== 1 ? "s" : ""}
              {excludedTotal > 0 && ` · ${fmtMoney(excludedTotal, currency)} not counted`}
            </p>
          </div>

          {/* Owed to me */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowDownLeft className="h-4 w-4 text-success" />
              <span className="uppercase tracking-wider font-medium">Owed to Me</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-success">{fmtMoney(owedToMe, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pendingLendings.filter(l => l.direction === "owed_to_me").length} pending</p>
          </div>

          {/* I owe */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowUpRight className="h-4 w-4 text-destructive" />
              <span className="uppercase tracking-wider font-medium">I Owe</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-destructive">{fmtMoney(iOwe, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pendingLendings.filter(l => l.direction === "i_owe").length} pending</p>
          </div>

          {/* Net balance */}
          <div className="hidden md:block rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="uppercase tracking-wider font-medium">Net Balance</span>
            </div>
            <p className={cn("text-xl font-bold tabular-nums", owedToMe - iOwe >= 0 ? "text-success" : "text-destructive")}>
              {owedToMe - iOwe >= 0 ? "+" : ""}{fmtMoney(Math.abs(owedToMe - iOwe), currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{owedToMe - iOwe >= 0 ? "You're owed more" : "You owe more"}</p>
          </div>
        </div>

        {/* Main content — 2 column on desktop */}
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {/* Category breakdown — larger column */}
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Spend by Category</h3>
              <button
                onClick={() => navigate("/personal/expenses")}
                className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
              >
                All months <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {topCats.length === 0 ? (
              <div className="py-10 text-center">
                <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">No spend data yet this month</p>
              </div>
            ) : (
              <div className="h-52">
                <Bar
                  data={{
                    labels: topCats.map(([catId]) => getCategory(catId).label),
                    datasets: [{
                      data: topCats.map(([, amt]) => amt),
                      backgroundColor: topCats.map(([catId]) => getCategory(catId).color),
                      borderRadius: 6,
                      maxBarThickness: 40,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => fmtMoney(ctx.raw as number, currency),
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } },
                      },
                      y: {
                        grid: { color: "rgba(128,128,128,0.1)" },
                        ticks: {
                          font: { size: 10 },
                          callback: (v) => fmtMoney(v as number, currency),
                        },
                      },
                    },
                  }}
                />
              </div>
            )}

            {/* Payment methods */}
            {Object.keys(payBreakdown).length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Payment Methods</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(payBreakdown).sort((a, b) => b[1] - a[1]).map(([pmId, amt]) => {
                    const pm = getPaymentMethod(pmId);
                    const Icon = pm.icon;
                    return (
                      <span key={pmId} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/70 px-3 py-1.5 text-xs font-medium">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {pm.label}
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums">{fmtMoney(amt, currency)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Recent transactions — right column */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Recent Transactions</h3>
              {recentAll.length > 0 && (
                <button
                  onClick={() => navigate("/personal/expenses")}
                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {recentAll.length === 0 ? (
              <div className="py-10 text-center">
                <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">No transactions yet</p>
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setShowAdd(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add expense
                </Button>
              </div>
            ) : (
              <div className="space-y-0.5 h-80 overflow-y-scroll overflow-x-hidden">
                {recentAll.map((e) => {
                  const cat = getCategory(e.category);
                  return (
                    <div key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-secondary/50 transition">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${cat.color}15`, color: cat.color }}>
                        <cat.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{e.description}</p>
                        <p className="text-[10px] text-muted-foreground">{relativeTime(e.date)}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{fmtMoney(e.amount, currency)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <PersonalExpenseDialog open={showAdd} onOpenChange={setShowAdd} defaultCurrency={currency} />
    </>
  );
}
