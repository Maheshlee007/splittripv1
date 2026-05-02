import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import { Group } from "./types";
import { computeBalances, computeShareAmount, simplifyDebts, totalSpent } from "./balances";
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

  const net = computeBalances(g);
  const balRows = [["Member", `Net (${g.currency})`], ...g.members.map((m) => [m.name, net[m.id] ?? 0])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(balRows), "Balances");

  const transfers = simplifyDebts(net);
  const tRows = [["From", "To", `Amount (${g.currency})`], ...transfers.map((t) => [memberName(g, t.fromId), memberName(g, t.toId), t.amount])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tRows), "Settle up");

  XLSX.writeFile(wb, `${g.name.replace(/[^\w]+/g, "_")}_${g.id}.xlsx`);
}

export function exportPDF(g: Group): void {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`${g.emoji} ${g.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Code ${g.id} · ${g.members.length} members · ${fmtMoney(totalSpent(g), g.currency)} spent`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [["Date", "Description", "Paid by", "Amount", "Category"]],
    body: g.expenses.map((e) => [
      fmtDate(e.createdAt),
      e.description,
      memberName(g, e.paidBy),
      fmtMoney(e.amount, g.currency),
      getCategory(e.category).label,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [249, 115, 22] },
  });

  const net = computeBalances(g);
  const transfers = simplifyDebts(net);
  const lastY = (doc as any).lastAutoTable.finalY ?? 60;

  autoTable(doc, {
    startY: lastY + 8,
    head: [["Member", "Net balance"]],
    body: g.members.map((m) => [m.name, fmtMoney(net[m.id] ?? 0, g.currency)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [34, 197, 94] },
  });

  if (transfers.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [["From", "To", "Amount"]],
      body: transfers.map((t) => [memberName(g, t.fromId), memberName(g, t.toId), fmtMoney(t.amount, g.currency)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  doc.save(`${g.name.replace(/[^\w]+/g, "_")}_${g.id}.pdf`);
}

export function buildWhatsAppText(g: Group): string {
  const net = computeBalances(g);
  const transfers = simplifyDebts(net);
  const lines: string[] = [];
  lines.push(`*${g.emoji} ${g.name}* (code ${g.id})`);
  lines.push(`Total spent: ${fmtMoney(totalSpent(g), g.currency)}`);
  lines.push("");
  lines.push("*Balances*");
  for (const m of g.members) {
    const v = net[m.id] ?? 0;
    if (Math.abs(v) < 0.01) lines.push(`• ${m.name}: settled`);
    else lines.push(`• ${m.name}: ${v > 0 ? "+" : ""}${fmtMoney(v, g.currency)}`);
  }
  if (transfers.length) {
    lines.push("");
    lines.push("*Settle up*");
    for (const t of transfers) {
      lines.push(`→ ${memberName(g, t.fromId)} pays ${memberName(g, t.toId)} ${fmtMoney(t.amount, g.currency)}`);
    }
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
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: getComputedStyle(document.body).backgroundColor });
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
  const g = JSON.parse(text) as Group;
  if (!g || typeof g !== "object" || !g.id || !Array.isArray(g.members)) {
    throw new Error("Invalid SplitTrip JSON");
  }
  return g;
}
