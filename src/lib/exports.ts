import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import { Group } from "./types";
import { buildExpenseBreakdownRows, buildMemberLedger, computeShareAmount, totalSpent } from "./balances";
import { fmtDate, fmtMoney } from "./format";
import { getCategory } from "./categories";

function memberName(g: Group, id: string) {
  return g.members.find((m) => m.id === id)?.name ?? "?";
}

export function exportExcel(g: Group): void {
  const wb = XLSX.utils.book_new();

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

  const ledger = buildMemberLedger(g);
  const balRows = [["Member", "Individual spent", "Share", "Balance", `Final (${g.currency})`], ...ledger.map((r) => [r.name, r.paid, r.owed, r.balance, r.finalBalance])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balRows), "Balances");

  const active = g.members.filter((m) => m.status !== "pending");
  const matrix = [["Date", "Category / desc", `Total (${g.currency})`, ...active.map((m) => m.name)],
    ...buildExpenseBreakdownRows(g).map((r) => [fmtDate(r.date), `${getCategory(r.category).label} - ${r.description}`, r.total, ...active.map((m) => r.shares[m.id] ?? 0)]),
    ["", "Spent per person", totalSpent(g), ...active.map((m) => -(ledger.find((r) => r.memberId === m.id)?.owed ?? 0))],
    ["", "Individual spent", "", ...active.map((m) => ledger.find((r) => r.memberId === m.id)?.paid ?? 0)],
    ["", "Balances", "", ...active.map((m) => ledger.find((r) => r.memberId === m.id)?.finalBalance ?? 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "Trip breakdown");

  XLSX.writeFile(wb, `${g.name.replace(/[^\w]+/g, "_")}_${g.id}.xlsx`);
}

function abbreviateName(name: string, maxLen = 10): string {
  if (name.length <= maxLen) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return name.slice(0, maxLen - 1) + "…";
}

function buildPDF(g: Group): jsPDF {
  const active = g.members.filter((m) => m.status !== "pending");
  const useLandscape = active.length > 5;
  const doc = new jsPDF({ orientation: useLandscape ? "landscape" : "portrait" });
  const nameMaxLen = useLandscape ? 8 : 14;
  const ledger = buildMemberLedger(g);
  const rows = buildExpenseBreakdownRows(g);

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
        ["", "Share per person", fmtMoney(totalSpent(g), g.currency), ...active.map((m) => fmtMoney(ledger.find((r) => r.memberId === m.id)?.owed ?? 0, g.currency))],
        ["", "Individual spent", "", ...active.map((m) => fmtMoney(ledger.find((r) => r.memberId === m.id)?.paid ?? 0, g.currency))],
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
  return JSON.stringify(g, null, 2);
}

export function buildWhatsAppText(g: Group): string {
  const ledger = buildMemberLedger(g);
  const owner = g.members.find((m) => m.id === g.ownerId) ?? g.members[0];
  const lines: string[] = [];
  lines.push(`*${g.emoji} ${g.name}* (code ${g.id})`);
  lines.push(`Total spent: ${fmtMoney(totalSpent(g), g.currency)}`);
  lines.push("");
  lines.push("*Balances*");
  for (const r of ledger) {
    const v = r.finalBalance;
    if (Math.abs(v) < 0.01) lines.push(`• ${r.name}: settled (spent ${fmtMoney(r.paid, g.currency)}, share ${fmtMoney(r.owed, g.currency)})`);
    else lines.push(`• ${r.name}: ${v > 0 ? "+" : "-"}${fmtMoney(Math.abs(v), g.currency)} (spent ${fmtMoney(r.paid, g.currency)}, share ${fmtMoney(r.owed, g.currency)})`);
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
