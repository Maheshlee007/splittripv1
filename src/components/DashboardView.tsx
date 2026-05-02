import { Group } from "@/lib/types";
import { computeBalances, computeShareAmount, memberSpent, totalSpent } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { TrendingUp, Users, Receipt, Wallet } from "lucide-react";

export function DashboardView({ group }: { group: Group }) {
  const total = totalSpent(group);
  const activeMembers = group.members.filter((m) => m.status !== "pending");
  const avg = activeMembers.length ? total / activeMembers.length : 0;

  // by category
  const byCat = new Map<string, number>();
  for (const e of group.expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  // per member: paid vs share
  const perMember = activeMembers.map((m) => {
    const paid = memberSpent(group, m.id);
    let share = 0;
    for (const e of group.expenses) share += computeShareAmount(e.amount, e.splitMode, e.splits, m.id);
    return { id: m.id, name: m.name, paid, share };
  });
  const maxPaid = Math.max(1, ...perMember.map((p) => p.paid));
  const maxShare = Math.max(1, ...perMember.map((p) => p.share));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Total" value={fmtMoney(total, group.currency)} />
        <Stat icon={<Users className="h-4 w-4" />} label="Avg / person" value={fmtMoney(avg, group.currency)} />
        <Stat icon={<Receipt className="h-4 w-4" />} label="Expenses" value={String(group.expenses.length)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Active" value={String(activeMembers.length)} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h3 className="mb-3 text-sm font-semibold">Per member</h3>
        {perMember.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-3">
            {perMember.map((p) => (
              <div key={p.id}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    paid <span className="text-foreground font-semibold">{fmtMoney(p.paid, group.currency)}</span>
                    <span className="mx-1">·</span>
                    share <span className="text-foreground font-semibold">{fmtMoney(p.share, group.currency)}</span>
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <Bar value={p.paid / maxPaid} colorClass="bg-primary" label="paid" />
                  <Bar value={p.share / maxShare} colorClass="bg-accent-foreground/70" label="share" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h3 className="mb-3 text-sm font-semibold">By category</h3>
        {cats.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <div className="space-y-2">
            {cats.map(([id, amt]) => {
              const c = getCategory(id);
              const Icon = c.icon;
              const pct = total ? (amt / total) * 100 : 0;
              return (
                <div key={id} className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${c.color}22`, color: c.color }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium">{c.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtMoney(amt, group.currency)} <span className="text-[10px]">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

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

function Bar({ value, colorClass, label }: { value: number; colorClass: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-9 text-[9px] uppercase text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}
