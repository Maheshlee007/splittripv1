import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import { Group } from "./types";
import { buildExpenseBreakdownRows, buildMemberLedger, computeShareAmount, totalSpent, isAdvanceExpense, getExpenseKind } from "./balances";
import { fmtDate } from "./format";
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
    if (isAdvanceExpense(e)) continue;
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
  const advanceExpenses = g.expenses.filter((x) => isAdvanceExpense(x));
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

function exportMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function applyColumnWidths(ws: XLSX.WorkSheet, rows: Array<Array<string | number>>) {
  const colCount = Math.max(...rows.map((r) => r.length), 0);
  ws["!cols"] = Array.from({ length: colCount }, (_, index) => {
    const maxLen = rows.reduce((max, row) => {
      const cell = row[index];
      const len = cell == null ? 0 : String(cell).split("\n").reduce((m, part) => Math.max(m, part.length), 0);
      return Math.max(max, len);
    }, 0);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 28) };
  });
}

function pdfMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportExcel(g: Group): void {
  const wb = XLSX.utils.book_new();
  const metrics = getExportMetrics(g);
  const active = metrics.active;

  const summary: Array<Array<string | number>> = [
    ["Trip", g.name],
    ["Code", g.id],
    ["Currency", g.currency],
    ["Members", g.members.length],
    ["Total spent", totalSpent(g)],
    ["Generated", new Date().toLocaleString()],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  applyColumnWidths(summarySheet, summary);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const expRows: Array<Array<string | number>> = [
    ["Date", "Description", "Type", "Category", "Paid by", `Amount (${g.currency})`, "Split mode", "Note", ...active.map((m) => m.name)],
    ...g.expenses.map((e) => [
      fmtDate(e.createdAt),
      e.description,
      getExpenseKind(e),
      getCategory(e.category).label,
      memberName(g, e.paidBy),
      round2(e.amount),
      e.splitMode,
      e.note ?? "",
      ...active.map((m) => {
        const inSplit = e.splits.some((s) => s.memberId === m.id);
        if (!inSplit) return "-";
        return round2(computeShareAmount(e.amount, e.splitMode, e.splits, m.id));
      }),
    ]),
  ];
  const expensesSheet = XLSX.utils.aoa_to_sheet(expRows);
  applyColumnWidths(expensesSheet, expRows);
  XLSX.utils.book_append_sheet(wb, expensesSheet, "Expenses");

  const ledger = metrics.ledger;
  const balRows: Array<Array<string | number>> = [["Member", "Individual spent", "Share", "Balance", `Final (${g.currency})`], ...ledger.map((r) => [r.name, round2(r.paid), round2(r.owed), round2(r.balance), round2(r.finalBalance)])];
  const balancesSheet = XLSX.utils.aoa_to_sheet(balRows);
  applyColumnWidths(balancesSheet, balRows);
  XLSX.utils.book_append_sheet(wb, balancesSheet, "Balances");

  const matrix: Array<Array<string | number>> = [["Date", "Category / desc", `Total (${g.currency})`, ...active.map((m) => m.name)],
    ...metrics.rows.map((r) => [fmtDate(r.date), `${getCategory(r.category).label} - ${r.description}`, round2(r.total), ...active.map((m) => round2(r.shares[m.id] ?? 0))]),
    ["", "Spent per person", round2(totalSpent(g)), ...active.map((m) => round2(-(ledger.find((r) => r.memberId === m.id)?.owed ?? 0)))],
    ["", "Individual spent", "", ...active.map((m) => round2(metrics.nonAdvanceSpentByMember[m.id] ?? 0))],
    ["", "Total advance", "", ...active.map((m) => {
      const paid = metrics.advanceByMember.paidMap[m.id] ?? 0;
      const unpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
      const extra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
      if (paid > 0 && extra > 0) return `${round2(paid).toFixed(2)}\n(extra ${round2(extra).toFixed(2)})`;
      if (paid > 0) return round2(paid);
      if (unpaid) return "Not paid";
      return "-";
    })],
    ["", "Balances", "", ...active.map((m) => round2(ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0))],
  ];
  const breakdownSheet = XLSX.utils.aoa_to_sheet(matrix);
  applyColumnWidths(breakdownSheet, matrix);
  XLSX.utils.book_append_sheet(wb, breakdownSheet, "Trip breakdown");

  if (metrics.advanceExpenses.length) {
    const advanceRows: Array<Array<string | number>> = [["Description", "Type", "Date", `Total (${g.currency})`, "Collected", "Pending", "Paid by", ...active.map((m) => m.name)]];
    for (const e of metrics.advanceExpenses) {
      const collectedCount = e.advancePayments?.filter((a) => a.hasPaid).length ?? 0;
      const totalCount = e.advancePayments?.length ?? e.splits.length;
      advanceRows.push([
        e.description,
        getExpenseKind(e),
        fmtDate(e.createdAt),
        round2(e.amount),
        `${collectedCount}/${totalCount}`,
        `${Math.max(totalCount - collectedCount, 0)}`,
        memberName(g, e.paidBy),
        ...active.map((m) => {
          const inSplit = e.splits.some((s) => s.memberId === m.id);
          if (!inSplit) return "-";
          const share = round2(computeShareAmount(e.amount, e.splitMode, e.splits, m.id));
          const ap = e.advancePayments?.find((a) => a.memberId === m.id);
          return ap?.hasPaid ? `Paid\n${share.toFixed(2)}` : "Not paid";
        }),
      ]);
    }
    const advanceSheet = XLSX.utils.aoa_to_sheet(advanceRows);
    applyColumnWidths(advanceSheet, advanceRows);
    XLSX.utils.book_append_sheet(wb, advanceSheet, "Advance payments");
  }

  XLSX.writeFile(wb, `${g.name.replace(/[^\w]+/g, "_")}_${g.id}.xlsx`);
}

function buildPDF(g: Group): jsPDF {
  const metrics = getExportMetrics(g);
  const active = metrics.active;
  const useLandscape = active.length > 5;
  const doc = new jsPDF({ orientation: useLandscape ? "landscape" : "portrait" });
  const ledger = metrics.ledger;
  const rows = metrics.rows;

  // Header
  doc.setFontSize(18);
  doc.text(`${g.emoji} ${g.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Code ${g.id} · ${active.length} members · ${pdfMoney(totalSpent(g))} spent · Generated ${new Date().toLocaleDateString()}`, 14, 25);
  doc.text(`All amounts in ${g.currency}`, 14, 30.5);
  doc.setTextColor(0);

  // Trip breakdown table (same as DashboardView)
  if (rows.length > 0) {
    doc.setFontSize(12);
    doc.text("Trip Breakdown", 14, 37);
    autoTable(doc, {
      startY: 41,
      head: [["Date", "Category / Description", `Total (${g.currency})`, ...active.map((m) => m.name)]],
      body: [
        ...rows.map((r) => [
          fmtDate(r.date),
          `${getCategory(r.category).label} - ${r.description}`,
          pdfMoney(r.total),
          ...active.map((m) => {
            const v = r.shares[m.id];
            return v ? pdfMoney(v) : "-";
          }),
        ]),
        // Summary rows
        ["", "Spent per person", pdfMoney(totalSpent(g)), ...active.map((m) => `-${pdfMoney(ledger.find((r) => r.memberId === m.id)?.owed ?? 0)}`)],
        ["", "Individual spent", "", ...active.map((m) => `+${pdfMoney(metrics.nonAdvanceSpentByMember[m.id] ?? 0)}`)],
        ["", "Total advance", "", ...active.map((m) => {
          const paid = metrics.advanceByMember.paidMap[m.id] ?? 0;
          const unpaid = metrics.advanceByMember.unpaidMap[m.id] ?? false;
          const extra = metrics.advanceByMember.ownerExtraMap[m.id] ?? 0;
          if (paid > 0 && extra > 0) return `+${pdfMoney(paid)}\n(extra ${pdfMoney(extra)})`;
          if (paid > 0) return `+${pdfMoney(paid)}`;
          if (unpaid) return "Not paid";
          return "-";
        })],
        ["", "Balance", "", ...active.map((m) => {
          const bal = ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0;
          return `${bal > 0 ? "+" : ""}${pdfMoney(bal)}`;
        })],
      ],
      styles: { fontSize: useLandscape ? 6 : 7, cellPadding: 2, overflow: "linebreak" },
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
      pdfMoney(r.paid),
      pdfMoney(r.owed),
      r.settled !== 0 ? pdfMoney(r.settled) : "-",
      `${r.finalBalance > 0 ? "+" : r.finalBalance < 0 ? "-" : ""}${pdfMoney(Math.abs(r.finalBalance))}`,
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
      body: settleRows.map((r) => [r.finalBalance < 0 ? `${r.name} pays ${owner?.name ?? "owner"}` : `${owner?.name ?? "Owner"} pays ${r.name}`, pdfMoney(Math.abs(r.finalBalance))]),
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
      head: [["Description", `Total (${g.currency})`, ...active.map((m) => m.name)]],
      body: metrics.advanceExpenses.map((e) => [
        `${e.description} (${getExpenseKind(e)})`,
        pdfMoney(e.amount),
        ...active.map((m) => {
          const inSplit = e.splits.some((s) => s.memberId === m.id);
          if (!inSplit) return "-";
          const share = computeShareAmount(e.amount, e.splitMode, e.splits, m.id);
          const ap = e.advancePayments?.find((a) => a.memberId === m.id);
          return ap?.hasPaid ? `Paid\n${pdfMoney(share)}` : "Not paid";
        }),
      ]),
      styles: { fontSize: useLandscape ? 6 : 7, cellPadding: 1.5, overflow: "linebreak" },
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
      expenseType: getExpenseKind(e),
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
  lines.push(`Total spent: ${exportMoney(totalSpent(g), g.currency)}`);
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
      ? `+${exportMoney(advPaid, g.currency)}${advExtra > 0 ? ` (extra ${exportMoney(advExtra, g.currency)})` : ""}`
      : advUnpaid
      ? "Not paid"
      : "-";
    lines.push(`• ${m.name}: Spent/person -${exportMoney(owed, g.currency)}, Individual +${exportMoney(individual, g.currency)}, Advance ${advText}, Balance ${finalBalance >= 0 ? "+" : "-"}${exportMoney(Math.abs(finalBalance), g.currency)}`);
  }

  if (metrics.advanceExpenses.length) {
    lines.push("", "*Advance payments*");
    for (const e of metrics.advanceExpenses) {
      lines.push(`• ${e.description} [${getExpenseKind(e)}] (${exportMoney(e.amount, g.currency)})`);
      for (const s of e.splits) {
        const share = computeShareAmount(e.amount, e.splitMode, e.splits, s.memberId);
        const ap = e.advancePayments?.find((a) => a.memberId === s.memberId);
        lines.push(`  - ${memberName(g, s.memberId)}: ${ap?.hasPaid ? `Paid ${exportMoney(share, g.currency)}` : "Not paid"}`);
      }
    }
  }

  lines.push("", "*Balances summary*");
  for (const r of ledger) {
    const v = r.finalBalance;
    if (Math.abs(v) < 0.01) lines.push(`• ${r.name}: settled`);
    else lines.push(`• ${r.name}: ${v > 0 ? "+" : "-"}${exportMoney(Math.abs(v), g.currency)}`);
  }

  const payOwner = ledger.filter((r) => r.memberId !== owner?.id && r.finalBalance < -0.01);
  const ownerPays = ledger.filter((r) => r.memberId !== owner?.id && r.finalBalance > 0.01);
  if (payOwner.length) {
    lines.push("", `*Pay ${owner?.name ?? "owner"}*`);
    for (const r of payOwner) lines.push(`→ ${r.name}: ${exportMoney(Math.abs(r.finalBalance), g.currency)}`);
  }
  if (ownerPays.length) {
    lines.push("", `*${owner?.name ?? "Owner"} pays extra spent*`);
    for (const r of ownerPays) lines.push(`→ ${r.name}: ${exportMoney(r.finalBalance, g.currency)}`);
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
