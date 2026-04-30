import { Expense, Group, Settlement, Split, SplitMode } from "./types";

export function computeShareAmount(amount: number, mode: SplitMode, splits: Split[], memberId: string): number {
  const s = splits.find((x) => x.memberId === memberId);
  if (!s) return 0;
  switch (mode) {
    case "equal": {
      return amount / splits.length;
    }
    case "shares": {
      const total = splits.reduce((a, b) => a + (b.value || 0), 0);
      if (total <= 0) return 0;
      return (amount * s.value) / total;
    }
    case "exact":
      return s.value;
    case "percent":
      return (amount * s.value) / 100;
  }
}

/** Net balance per member: positive = others owe them, negative = they owe */
export function computeBalances(group: Group): Record<string, number> {
  const net: Record<string, number> = {};
  for (const m of group.members) net[m.id] = 0;

  for (const e of group.expenses) {
    if (!net[e.paidBy] && net[e.paidBy] !== 0) net[e.paidBy] = 0;
    net[e.paidBy] += e.amount;
    for (const s of e.splits) {
      const owed = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
      if (!net[s.memberId] && net[s.memberId] !== 0) net[s.memberId] = 0;
      net[s.memberId] -= owed;
    }
  }
  for (const st of group.settlements) {
    if (!net[st.fromId] && net[st.fromId] !== 0) net[st.fromId] = 0;
    if (!net[st.toId] && net[st.toId] !== 0) net[st.toId] = 0;
    net[st.fromId] += st.amount;
    net[st.toId] -= st.amount;
  }
  return net;
}

export interface Transfer { fromId: string; toId: string; amount: number; }

/** Greedy minimal-transfers settlement */
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const eps = 0.01;
  const debtors: { id: string; v: number }[] = [];
  const creditors: { id: string; v: number }[] = [];
  for (const [id, v] of Object.entries(net)) {
    if (v < -eps) debtors.push({ id, v: -v });
    else if (v > eps) creditors.push({ id, v });
  }
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amount: Math.round(pay * 100) / 100 });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v < eps) i++;
    if (creditors[j].v < eps) j++;
  }
  return transfers;
}

export function totalSpent(g: Group): number {
  return g.expenses.reduce((a, b) => a + b.amount, 0);
}

export function memberSpent(g: Group, memberId: string): number {
  return g.expenses.filter((e) => e.paidBy === memberId).reduce((a, b) => a + b.amount, 0);
}
