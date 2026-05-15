import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePersonal } from "@/store/PersonalStore";
import { useApp } from "@/store/AppStore";
import { monthKeyLabel } from "@/lib/personal-utils";
import { fmtMoney } from "@/lib/format";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function PersonalYearGrid() {
  const navigate = useNavigate();
  const { getYearTotals, expenses } = usePersonal();
  const { profile } = useApp();
  const currency = profile.defaultCurrency ?? "INR";

  const [year, setYear] = useState(() => new Date().getFullYear());
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const totals = useMemo(() => getYearTotals(year), [getYearTotals, year]);
  const yearTotal = useMemo(() => Object.values(totals).reduce((a, b) => a + b, 0), [totals]);
  const monthCount = useMemo(() => Object.values(totals).filter((v) => v > 0).length, [totals]);
  const avgMonthly = monthCount > 0 ? yearTotal / monthCount : 0;

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      return { key, total: totals[key] ?? 0 };
    });
  }, [year, totals]);

  const maxMonthTotal = useMemo(() => Math.max(...months.map((m) => m.total), 1), [months]);

  return (
    <div className="space-y-4">
      {/* Year navigation + summary */}
      <div className="flex items-center justify-between">
        <button onClick={() => setYear((y) => y - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-lg font-bold">{year}</div>
          <div className="text-xs text-muted-foreground">
            {fmtMoney(yearTotal, currency)} total · avg {fmtMoney(avgMonthly, currency)}/mo
          </div>
        </div>
        <button
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= new Date().getFullYear()}
          className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Month cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {months.map((m) => {
          const isCurrent = m.key === currentMonthKey;
          const isFuture = m.key > currentMonthKey;
          const txCount = expenses.filter((e) => e.monthKey === m.key).length;
          const barWidth = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;

          return (
            <button
              key={m.key}
              onClick={() => navigate(`/me/month/${m.key.replace("-", "/")}`)}
              disabled={isFuture && m.total === 0}
              className={cn(
                "relative flex flex-col gap-1 rounded-xl border p-3 text-left transition-all hover:shadow-elevated",
                isCurrent ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card",
                isFuture && m.total === 0 && "opacity-40 cursor-default"
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {monthKeyLabel(m.key).split(" ")[0]}
              </span>
              <span className={cn("text-sm font-bold tabular-nums", m.total > 0 ? "text-foreground" : "text-muted-foreground")}>
                {m.total > 0 ? fmtMoney(m.total, currency) : "—"}
              </span>
              {/* Mini progress bar */}
              {m.total > 0 && (
                <div className="mt-1 h-1 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${barWidth}%` }} />
                </div>
              )}
              {txCount > 0 && (
                <span className="text-[10px] text-muted-foreground">{txCount} txn{txCount > 1 ? "s" : ""}</span>
              )}
              {isCurrent && (
                <TrendingUp className="absolute right-2 top-2 h-3 w-3 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
