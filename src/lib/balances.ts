import { Expense, Group, Settlement, Split, SplitMode } from "./types";

export interface MemberLedgerRow {
  memberId: string;
  name: string;
  paid: number;
  owed: number;
  balance: number;
  settled: number;
  finalBalance: number;
}

export interface BreakdownRow {
  id: string;
  date: number;
  category: string;
  description: string;
  total: number;
  paidBy: string;
  shares: Record<string, number>;
}

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
    const amt = effectiveSettlementAmount(st);
    if (amt <= 0) continue;
    if (!net[st.fromId] && net[st.fromId] !== 0) net[st.fromId] = 0;
    if (!net[st.toId] && net[st.toId] !== 0) net[st.toId] = 0;
    net[st.fromId] += amt;
    net[st.toId] -= amt;
  }
  return net;
}

function effectiveSettlementAmount(st: Settlement): number {
  // Plain settlements (no status) keep their amount.
  // Claim-flow settlements only count when approved/partial.
  if (!st.status) return st.amount;
  if (st.status === "approved" || st.status === "partial") return st.approvedAmount ?? st.amount;
  return 0;
}

export function buildMemberLedger(group: Group): MemberLedgerRow[] {
  const active = group.members.filter((m) => m.status !== "pending");
  const rows: Record<string, MemberLedgerRow> = Object.fromEntries(
    active.map((m) => [m.id, { memberId: m.id, name: m.name, paid: 0, owed: 0, balance: 0, settled: 0, finalBalance: 0 }])
  );

  for (const e of group.expenses) {
    if (!rows[e.paidBy]) rows[e.paidBy] = { memberId: e.paidBy, name: group.members.find((m) => m.id === e.paidBy)?.name ?? "Unknown", paid: 0, owed: 0, balance: 0, settled: 0, finalBalance: 0 };
    rows[e.paidBy].paid += e.amount;
    for (const s of e.splits) {
      if (!rows[s.memberId]) rows[s.memberId] = { memberId: s.memberId, name: group.members.find((m) => m.id === s.memberId)?.name ?? "Unknown", paid: 0, owed: 0, balance: 0, settled: 0, finalBalance: 0 };
      rows[s.memberId].owed += computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
    }
  }

  for (const st of group.settlements) {
    const amt = effectiveSettlementAmount(st);
    if (amt <= 0) continue;
    if (rows[st.fromId]) rows[st.fromId].settled += amt;
    if (rows[st.toId]) rows[st.toId].settled -= amt;
  }

  return Object.values(rows).map((r) => {
    const balance = r.paid - r.owed;
    return { ...r, balance, finalBalance: balance + r.settled };
  });
}

export function buildExpenseBreakdownRows(group: Group): BreakdownRow[] {
  return [...group.expenses]
    .map((e) => ({
      id: e.id,
      date: (e as any).date ?? e.createdAt,
      category: e.category,
      description: e.description,
      total: e.amount,
      paidBy: e.paidBy,
      shares: Object.fromEntries(e.splits.map((s) => [s.memberId, computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId)])),
    }))
    .sort((a, b) => b.date - a.date);
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
