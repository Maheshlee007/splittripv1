import { forwardRef, useMemo } from "react";
import { Group } from "@/lib/types";
import { computeShareAmount, memberSpent, totalSpent } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { TrendingUp, Users, Receipt, Wallet } from "lucide-react";

export const DashboardView = forwardRef<HTMLDivElement, { group: Group }>(({ group }, ref) => {
  const total = totalSpent(group);
  const activeMembers = group.members.filter((m) => m.status !== "pending");
  const avg = activeMembers.length ? total / activeMembers.length : 0;

  // Build matrix: row = (dateKey, category), members → amount paid by them in that bucket
  const rows = useMemo(() => {
    const buckets = new Map<string, { date: number; category: string; total: number; perMember: Record<string, number> }>();
    for (const e of group.expenses) {
      const d = new Date(e.createdAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const key = `${dateKey}__${e.category}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { date: e.createdAt, category: e.category, total: 0, perMember: {} };
        buckets.set(key, bucket);
      }
      bucket.total += e.amount;
      // attribute each split share to that member
      for (const s of e.splits) {
        const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
        bucket.perMember[s.memberId] = (bucket.perMember[s.memberId] ?? 0) + share;
      }
    }
    const arr = [...buckets.values()];
    arr.sort((a, b) => b.date - a.date || a.category.localeCompare(b.category));
    return arr;
  }, [group.expenses]);

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

  return (
    <div ref={ref} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Total" value={fmtMoney(total, group.currency)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Avg / person" value={fmtMoney(avg, group.currency)} />
        <Stat icon={<Receipt className="h-4 w-4" />} label="Expenses" value={String(group.expenses.length)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Active" value={String(activeMembers.length)} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-card sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Trip breakdown</h3>
          <span className="text-[10px] text-muted-foreground">share per member · {group.currency}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No expenses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Category</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  {activeMembers.map((m) => (
                    <th key={m.id} className="px-2 py-2 text-right font-semibold">{m.name}</th>
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
                          <span className="inline-flex items-center gap-1.5">
                            <span className="grid h-5 w-5 place-items-center rounded" style={{ background: `${c.color}22`, color: c.color }}>
                              <Icon className="h-3 w-3" />
                            </span>
                            {c.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{fmtMoney(r.total, group.currency)}</td>
                        {activeMembers.map((m) => {
                          const v = r.perMember[m.id] ?? 0;
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
                {/* Member totals */}
                <tr className="border-t-2 border-primary/30 bg-primary/5 font-semibold">
                  <td colSpan={2} className="px-2 py-2 text-right">Total share</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(total, group.currency)}</td>
                  {activeMembers.map((m) => {
                    let s = 0;
                    for (const e of group.expenses) s += computeShareAmount(e.amount, e.splitMode, e.splits, m.id);
                    return <td key={m.id} className="px-2 py-2 text-right tabular-nums">{fmtMoney(s, group.currency)}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
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
