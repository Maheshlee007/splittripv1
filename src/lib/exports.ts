import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import { Group } from "./types";
import { buildExpenseBreakdownRows, buildMemberLedger, computeShareAmount, totalSpent } from "./balances";
import { fmtDate, fmtMoney } from "./format";
import { getCategory } from "./categories";

interface ExportMetrics {
  active: Group["members"];
  rows: ReturnType<typeof buildExpenseBreakdownRows>;
  ledger: ReturnType<typeof buildMemberLedger>;
  nonAdvanceSpentByMember: Record<string, number>;
  advanceByMember: {
    paidMap: Record<string, number>;
    unpaidMap: Record<string, boolean>;
    ownerExtraMap: Record<string, number>;
  };
  advanceExpenses: Group["expenses"];
}

function getExportMetrics(g: Group): ExportMetrics {
  const active = g.members.filter((m) => m.status !== "pending");
  const rows = buildExpenseBreakdownRows(g);
  const ledger = buildMemberLedger(g);

  const nonAdvanceSpentByMember: Record<string, number> = {};
  for (const m of active) nonAdvanceSpentByMember[m.id] = 0;
  for (const e of g.expenses) {
    if (e.isAdvance) continue;
    nonAdvanceSpentByMember[e.paidBy] = (nonAdvanceSpentByMember[e.paidBy] ?? 0) + e.amount;
  }

  const paidMap: Record<string, number> = {};
  const unpaidMap: Record<string, boolean> = {};
  const ownerExtraMap: Record<string, number> = {};
  for (const m of active) {
    paidMap[m.id] = 0;
    unpaidMap[m.id] = false;
    ownerExtraMap[m.id] = 0;
  }
  const advanceExpenses = g.expenses.filter((x) => x.isAdvance);
  for (const e of advanceExpenses) {
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

  return {
    active,
    rows,
    ledger,
    nonAdvanceSpentByMember,
    advanceByMember: { paidMap, unpaidMap, ownerExtraMap },
    advanceExpenses,
  };
}

function memberName(g: Group, id: string) {
  return g.members.find((m) => m.id === id)?.name ?? "?";
}

export function exportExcel(g: Group): void {
  const wb = XLSX.utils.book_new();
  const metrics = getExportMetrics(g);

  const summary = [
    ["Trip", g.name],
    ["Code", g.id],
    ["Currency", g.currency],
    ["Members", g.members.length],
    ["Total spent", totalSpent(g)],
    ["Generated", new Date().toLocaleString()],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const expRows = [
    ["Date", "Description", "Category", "Paid by", `Amount (${g.currency})`, "Split", "Note"],
    ...g.expenses.map((e) => [
      fmtDate(e.createdAt),
      e.description,
      getCategory(e.category).label,
      memberName(g, e.paidBy),
      e.amount,
      e.splits.map((s) => `${memberName(g, s.memberId)}:${computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId).toFixed(2)}`).join("; "),
      e.note ?? "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), "Expenses");

  const ledger = metrics.ledger;
  const balRows = [["Member", "Individual spent", "Share", "Balance", `Final (${g.currency})`], ...ledger.map((r) => [r.name, r.paid, r.owed, r.balance, r.finalBalance])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balRows), "Balances");

  const active = metrics.active;
  const matrix = [["Date", "Category / desc", `Total (${g.currency})`, ...active.map((m) => m.name)],
    ...metrics.rows.map((r) => [fmtDate(r.date), `${getCategory(r.category).label} - ${r.description}`, r.total, ...active.map((m) => r.shares[m.id] ?? 0)]),
    ["", "Spent per person", totalSpent(g), ...active.map((m) => -(ledger.find((r) => r.memberId === m.id)?.owed ?? 0))],
    ["", "Individual spent", "", ...active.map((m) => metrics.nonAdvanceSpentByMember[m.id] ?? 0)],
    ["", "Total advance", "", ...active.map((m) => {
      const paid = metrics.advanceByMember.paidMap[m.id] ?? 0;
      const unpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
      const extra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
      if (paid > 0 && extra > 0) return `${paid.toFixed(2)} (extra ${extra.toFixed(2)})`;
      if (paid > 0) return paid;
      if (unpaid) return "Not paid";
      return "-";
    })],
    ["", "Balances", "", ...active.map((m) => ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "Trip breakdown");

  if (metrics.advanceExpenses.length) {
    const advanceRows = [["Description", "Date", `Total (${g.currency})`, "Collected", "Pending", "Paid by", "Per-member status"]];
    for (const e of metrics.advanceExpenses) {
      const collectedCount = e.advancePayments?.filter((a) => a.hasPaid).length ?? 0;
      const totalCount = e.advancePayments?.length ?? e.splits.length;
      const status = e.splits
        .map((s) => {
          const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
          const ap = e.advancePayments?.find((a) => a.memberId === s.memberId);
          return `${memberName(g, s.memberId)}:${ap?.hasPaid ? `Paid ${share.toFixed(2)}` : "Not paid"}`;
        })
        .join("; ");
      advanceRows.push([
        e.description,
        fmtDate(e.createdAt),
        String(e.amount),
        `${collectedCount}/${totalCount}`,
        `${Math.max(totalCount - collectedCount, 0)}`,
        memberName(g, e.paidBy),
        status,
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(advanceRows), "Advance payments");
  }

  XLSX.writeFile(wb, `${g.name.replace(/[^\w]+/g, "_")}_${g.id}.xlsx`);
}

function abbreviateName(name: string, maxLen = 10): string {
  if (name.length <= maxLen) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return name.slice(0, maxLen - 1) + "…";
}

function buildPDF(g: Group): jsPDF {
  const metrics = getExportMetrics(g);
  const active = metrics.active;
  const useLandscape = active.length > 5;
  const doc = new jsPDF({ orientation: useLandscape ? "landscape" : "portrait" });
  const nameMaxLen = useLandscape ? 8 : 14;
  const ledger = metrics.ledger;
  const rows = metrics.rows;

  // Header
  doc.setFontSize(18);
  doc.text(`${g.emoji} ${g.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Code ${g.id} · ${active.length} members · ${fmtMoney(totalSpent(g), g.currency)} spent · Generated ${new Date().toLocaleDateString()}`, 14, 25);
  doc.setTextColor(0);

  // Trip breakdown table (same as DashboardView)
  if (rows.length > 0) {
    doc.setFontSize(12);
    doc.text("Trip Breakdown", 14, 34);
    autoTable(doc, {
      startY: 38,
      head: [["Date", "Category / Description", `Total (${g.currency})`, ...active.map((m) => abbreviateName(m.name, nameMaxLen))]],
      body: [
        ...rows.map((r) => [
          fmtDate(r.date),
          `${getCategory(r.category).label} - ${r.description}`,
          fmtMoney(r.total, g.currency),
          ...active.map((m) => {
            const v = r.shares[m.id];
            return v ? fmtMoney(v, g.currency).replace(/^¹/, "") : "-";
          }),
        ]),
        // Summary rows
        ["", "Spent per person", fmtMoney(totalSpent(g), g.currency), ...active.map((m) => `-${fmtMoney(ledger.find((r) => r.memberId === m.id)?.owed ?? 0, g.currency)}`)],
        ["", "Individual spent", "", ...active.map((m) => `+${fmtMoney(metrics.nonAdvanceSpentByMember[m.id] ?? 0, g.currency)}`)],
        ["", "Total advance", "", ...active.map((m) => {
          const paid = metrics.advanceByMember.paidMap[m.id] ?? 0;
          const unpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
          const extra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
          if (paid > 0 && extra > 0) return `+${fmtMoney(paid, g.currency)} (extra ${fmtMoney(extra, g.currency)})`;
          if (paid > 0) return `+${fmtMoney(paid, g.currency)}`;
          if (unpaid) return "Not paid";
          return "-";
        })],
        ["", "Balance", "", ...active.map((m) => {
          const bal = ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0;
          return `${bal > 0 ? "+" : ""}${fmtMoney(bal, g.currency)}`;
        })],
      ],
      styles: { fontSize: useLandscape ? 7 : 8, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22], fontSize: useLandscape ? 6 : 7 },
      columnStyles: { 0: { cellWidth: useLandscape ? 20 : 22 }, 1: { cellWidth: useLandscape ? 34 : 40 } },
      margin: { left: 10, right: 10, top: 5, bottom: 5 },
    });
  }

  // Balances summary
  const lastY = (doc as any).lastAutoTable?.finalY ?? 60;
  doc.setFontSize(12);
  doc.text("Member Balances", 14, lastY + 10);

  autoTable(doc, {
    startY: lastY + 14,
    head: [["Member", "Spent", "Share", "Settled", "Final Balance"]],
    body: ledger.map((r) => [
      r.name,
      fmtMoney(r.paid, g.currency),
      fmtMoney(r.owed, g.currency),
      r.settled !== 0 ? fmtMoney(r.settled, g.currency) : "-",
      `${r.finalBalance > 0 ? "+" : r.finalBalance < 0 ? "-" : ""}${fmtMoney(Math.abs(r.finalBalance), g.currency)}`,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [34, 197, 94] },
  });

  // Settlements needed
  const owner = g.members.find((m) => m.id === g.ownerId) ?? g.members[0];
  const settleRows = ledger.filter((r) => r.memberId !== owner?.id && Math.abs(r.finalBalance) > 0.01);
  if (settleRows.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["Action", "Amount"]],
      body: settleRows.map((r) => [r.finalBalance < 0 ? `${r.name} pays ${owner?.name ?? "owner"}` : `${owner?.name ?? "Owner"} pays ${r.name}`, fmtMoney(Math.abs(r.finalBalance), g.currency)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  if (metrics.advanceExpenses.length) {
    const currentY = (doc as any).lastAutoTable?.finalY ?? lastY + 20;
    doc.setFontSize(12);
    doc.text("Advance Payments", 14, currentY + 10);
    autoTable(doc, {
      startY: currentY + 14,
      head: [["Description", `Total (${g.currency})`, ...active.map((m) => abbreviateName(m.name, nameMaxLen))]],
      body: metrics.advanceExpenses.map((e) => [
        e.description,
        fmtMoney(e.amount, g.currency),
        ...active.map((m) => {
          const inSplit = e.splits.some((s) => s.memberId === m.id);
          if (!inSplit) return "-";
          const share = computeShareAmount(e.amount, e.splitMode, e.splits, m.id);
          const ap = e.advancePayments?.find((a) => a.memberId === m.id);
          return ap?.hasPaid ? `Paid ${fmtMoney(share, g.currency)}` : "Not paid";
        }),
      ]),
      styles: { fontSize: useLandscape ? 7 : 8, cellPadding: 1.5 },
      headStyles: { fillColor: [34, 197, 94], fontSize: useLandscape ? 6 : 7 },
      margin: { left: 10, right: 10, top: 5, bottom: 5 },
    });
  }
  return doc;
}

export function exportPDF(g: Group): void {
  buildPDF(g).save(`${g.name.replace(/[^\w]+/g, "_")}_${g.id}.pdf`);
}

export function buildPDFBlobUrl(g: Group): string {
  const blob = buildPDF(g).output("blob");
  return URL.createObjectURL(blob);
}

export function buildJSONString(g: Group): string {
  const metrics = getExportMetrics(g);
  const payload = {
    generatedAt: new Date().toISOString(),
    trip: {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      currency: g.currency,
      members: metrics.active.map((m) => ({ id: m.id, name: m.name })),
      totalSpent: totalSpent(g),
    },
    breakdown: {
      spentPerPerson: Object.fromEntries(metrics.active.map((m) => [m.id, ledgerValue(metrics.ledger, m.id, "owed")])),
      individualSpent: Object.fromEntries(metrics.active.map((m) => [m.id, metrics.nonAdvanceSpentByMember[m.id] ?? 0])),
      totalAdvance: Object.fromEntries(metrics.active.map((m) => {
        const paid = metrics.advanceByMember.paidMap[m.id] ?? 0;
        const unpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
        const extra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
        return [m.id, { paid, unpaid, extra }];
      })),
      balances: Object.fromEntries(metrics.active.map((m) => [m.id, ledgerValue(metrics.ledger, m.id, "finalBalance")])),
    },
    advancePayments: metrics.advanceExpenses.map((e) => ({
      description: e.description,
      total: e.amount,
      paidBy: memberName(g, e.paidBy),
      members: e.splits.map((s) => {
        const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
        const ap = e.advancePayments?.find((a) => a.memberId === s.memberId);
        return {
          memberId: s.memberId,
          memberName: memberName(g, s.memberId),
          share,
          hasPaid: !!ap?.hasPaid,
        };
      }),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function ledgerValue(
  ledger: ReturnType<typeof buildMemberLedger>,
  memberId: string,
  key: "owed" | "finalBalance"
): number {
  return ledger.find((r) => r.memberId === memberId)?.[key] ?? 0;
}

export function buildWhatsAppText(g: Group): string {
  const metrics = getExportMetrics(g);
  const ledger = metrics.ledger;
  const owner = g.members.find((m) => m.id === g.ownerId) ?? g.members[0];
  const lines: string[] = [];
  lines.push(`*${g.emoji} ${g.name}* (code ${g.id})`);
  lines.push(`Total spent: ${fmtMoney(totalSpent(g), g.currency)}`);
  lines.push("");
  lines.push("*Trip breakdown* (same as dashboard)");
  for (const m of metrics.active) {
    const owed = ledger.find((r) => r.memberId === m.id)?.owed ?? 0;
    const finalBalance = ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0;
    const individual = metrics.nonAdvanceSpentByMember[m.id] ?? 0;
    const advPaid = metrics.advanceByMember.paidMap[m.id] ?? 0;
    const advExtra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
    const advUnpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
    const advText = advPaid > 0
      ? `+${fmtMoney(advPaid, g.currency)}${advExtra > 0 ? ` (extra ${fmtMoney(advExtra, g.currency)})` : ""}`
      : advUnpaid
      ? "Not paid"
      : "-";
    lines.push(`• ${m.name}: Spent/person -${fmtMoney(owed, g.currency)}, Individual +${fmtMoney(individual, g.currency)}, Advance ${advText}, Balance ${finalBalance >= 0 ? "+" : "-"}${fmtMoney(Math.abs(finalBalance), g.currency)}`);
  }

  if (metrics.advanceExpenses.length) {
    lines.push("", "*Advance payments*");
    for (const e of metrics.advanceExpenses) {
      lines.push(`• ${e.description} (${fmtMoney(e.amount, g.currency)})`);
      for (const s of e.splits) {
        const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
        const ap = e.advancePayments?.find((a) => a.memberId === s.memberId);
        lines.push(`  - ${memberName(g, s.memberId)}: ${ap?.hasPaid ? `Paid ${fmtMoney(share, g.currency)}` : "Not paid"}`);
      }
    }
  }

  lines.push("", "*Balances summary*");
  for (const r of ledger) {
    const v = r.finalBalance;
    if (Math.abs(v) < 0.01) lines.push(`• ${r.name}: settled`);
    else lines.push(`• ${r.name}: ${v > 0 ? "+" : "-"}${fmtMoney(Math.abs(v), g.currency)}`);
  }

  const payOwner = ledger.filter((r) => r.memberId !== owner?.id && r.finalBalance < -0.01);
  const ownerPays = ledger.filter((r) => r.memberId !== owner?.id && r.finalBalance > 0.01);
  if (payOwner.length) {
    lines.push("", `*Pay ${owner?.name ?? "owner"}*`);
    for (const r of payOwner) lines.push(`→ ${r.name}: ${fmtMoney(Math.abs(r.finalBalance), g.currency)}`);
  }
  if (ownerPays.length) {
    lines.push("", `*${owner?.name ?? "Owner"} pays extra spent*`);
    for (const r of ownerPays) lines.push(`→ ${r.name}: ${fmtMoney(r.finalBalance, g.currency)}`);
  }
  lines.push("");
  lines.push("Tracked with SplitTrip 🧳");
  return lines.join("\n");
}

export async function shareWhatsApp(g: Group): Promise<void> {
  const text = buildWhatsAppText(g);
  if (navigator.share) {
    try { await navigator.share({ title: g.name, text }); return; } catch {}
  }
  await navigator.clipboard.writeText(text);
}

export async function exportImage(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    width: node.scrollWidth,
    height: node.scrollHeight,
    style: { overflow: "visible", maxHeight: "none" },
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function exportJSON(g: Group): void {
  const blob = new Blob([JSON.stringify(g, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${g.name.replace(/[^\w]+/g, "_")}_${g.id}.splittrip.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importJSON(file: File): Promise<Group> {
  const text = await file.text();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Not valid JSON"); }
  const { safeParseGroup } = await import("./schema");
  const parsed = safeParseGroup(raw);
  if (!parsed.success) {
    throw new Error("Invalid SplitTrip JSON: " + (parsed.error.issues[0]?.message ?? "schema error"));
  }
  return parsed.data as unknown as Group;
}
