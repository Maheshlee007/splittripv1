import { useState, useMemo } from "react";
import { usePersonal } from "@/store/PersonalStore";
import { useApp } from "@/store/AppStore";
import { PersonalExpense } from "@/lib/types";
import { PersonalExpenseDialog } from "./PersonalExpenseDialog";
import { fmtMoney, relativeTime } from "@/lib/format";
import { getCategory, CATEGORIES } from "@/lib/categories";
import { getPaymentMethod, DEFAULT_PAYMENT_METHODS, monthKeyFullLabel } from "@/lib/personal-utils";
import { Plus, Pencil, Trash2, Search, X, Image as ImageIcon, Download, FileText, FileSpreadsheet, Copy, TableProperties, LayoutList, Calendar, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Props {
  monthKey: string;
}

export function PersonalMonthView({ monthKey }: Props) {
  const { getMonthExpenses, getCategoryBreakdown, getPaymentBreakdown, removeExpense } = usePersonal();
  const { profile } = useApp();
  const currency = profile.defaultCurrency ?? "INR";

  const expenses = useMemo(() => getMonthExpenses(monthKey), [getMonthExpenses, monthKey]);
  const catBreakdown = useMemo(() => getCategoryBreakdown(monthKey), [getCategoryBreakdown, monthKey]);
  const payBreakdown = useMemo(() => getPaymentBreakdown(monthKey), [getPaymentBreakdown, monthKey]);
  const monthTotal = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  // Export functions
  const buildPDFDoc = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Personal Expenses — ${monthKeyFullLabel(monthKey)}`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Total: ${fmtMoney(monthTotal, currency)} · ${expenses.length} transactions · Generated ${new Date().toLocaleDateString()}`, 14, 25);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 32,
      head: [["Date", "Description", "Category", "Payment", `Amount (${currency})`, "Note"]],
      body: expenses.sort((a, b) => b.date - a.date).map((e) => [
        new Date(e.date).toLocaleDateString(),
        e.description,
        getCategory(e.category).label,
        getPaymentMethod(e.paymentMethod).label,
        fmtMoney(e.amount, currency),
        e.note ?? "",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22], fontSize: 8 },
    });

    const lastY = (doc as any).lastAutoTable?.finalY ?? 60;
    doc.setFontSize(11);
    doc.text("Category Breakdown", 14, lastY + 10);
    autoTable(doc, {
      startY: lastY + 14,
      head: [["Category", `Amount (${currency})`, "% of Total"]],
      body: Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).map(([catId, amt]) => [
        getCategory(catId).label,
        fmtMoney(amt, currency),
        `${(monthTotal > 0 ? (amt / monthTotal) * 100 : 0).toFixed(1)}%`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [34, 197, 94] },
    });
    return doc;
  };

  const exportPDF = () => {
    if (expenses.length === 0) return;
    buildPDFDoc().save(`personal_expenses_${monthKey}.pdf`);
    toast.success("PDF downloaded");
  };

  const buildPDFBlobUrl = () => {
    const blob = buildPDFDoc().output("blob");
    return URL.createObjectURL(blob);
  };

  const buildTextSummary = () => {
    const lines = [`Personal Expenses — ${monthKeyFullLabel(monthKey)}`, `Total: ${fmtMoney(monthTotal, currency)}`, ""];
    for (const e of expenses.sort((a, b) => b.date - a.date)) {
      lines.push(`${new Date(e.date).toLocaleDateString()} | ${e.description} | ${getCategory(e.category).label} | ${getPaymentMethod(e.paymentMethod).label} | ${fmtMoney(e.amount, currency)}`);
    }
    lines.push("", "— Category Breakdown —");
    for (const [catId, amt] of Object.entries(catBreakdown).sort((a, b) => b[1] - a[1])) {
      lines.push(`${getCategory(catId).label}: ${fmtMoney(amt, currency)} (${(monthTotal > 0 ? (amt / monthTotal) * 100 : 0).toFixed(0)}%)`);
    }
    return lines.join("\n");
  };

  const exportExcel = () => {
    if (expenses.length === 0) return;
    const wb = XLSX.utils.book_new();
    const rows = expenses.sort((a, b) => b.date - a.date).map((e) => ({
      Date: new Date(e.date).toLocaleDateString(),
      Description: e.description,
      Category: getCategory(e.category).label,
      "Payment Method": getPaymentMethod(e.paymentMethod).label,
      Amount: e.amount,
      Note: e.note ?? "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Expenses");

    const catRows = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).map(([catId, amt]) => ({
      Category: getCategory(catId).label,
      Amount: amt,
      "% of Total": `${(monthTotal > 0 ? (amt / monthTotal) * 100 : 0).toFixed(1)}%`,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), "Categories");

    XLSX.writeFile(wb, `personal_expenses_${monthKey}.xlsx`);
    toast.success("Excel downloaded");
  };

  const copyText = async () => {
    if (expenses.length === 0) return;
    await navigator.clipboard.writeText(buildTextSummary());
    toast.success("Copied to clipboard");
  };

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PersonalExpense | null>(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [viewBill, setViewBill] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "table">(() => (localStorage.getItem("splittrip:expense-view") as "list" | "table") || "list");
  const [previewKind, setPreviewKind] = useState<"pdf" | "text" | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");

  const setView = (v: "list" | "table") => { setViewMode(v); localStorage.setItem("splittrip:expense-view", v); };

  const openPreview = (kind: "pdf" | "text") => {
    if (kind === "pdf") {
      setPdfUrl(buildPDFBlobUrl());
    }
    setPreviewKind(kind);
  };

  const closePreview = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
    setPreviewKind(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses
      .filter((e) => filterCat === "all" || e.category === filterCat)
      .filter((e) => filterPay === "all" || e.paymentMethod === filterPay)
      .filter((e) => !filterDate || new Date(e.date).toISOString().startsWith(filterDate))
      .filter((e) => !q || e.description.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q));
  }, [expenses, query, filterCat, filterPay, filterDate]);

  // Group by day
  const dayGroups = useMemo(() => {
    const map = new Map<string, { ts: number; total: number; items: PersonalExpense[] }>();
    for (const e of filtered) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, { ts: e.date, total: 0, items: [] });
      const g = map.get(key)!;
      g.total += e.amount;
      g.items.push(e);
    }
    return [...map.values()].sort((a, b) => b.ts - a.ts);
  }, [filtered]);

  const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });

  // Top categories sorted
  const topCats = useMemo(() =>
    Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [catBreakdown]
  );

  return (
    <div className="space-y-4">
      {/* Month summary header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{monthKeyFullLabel(monthKey)}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{expenses.length} transaction{expenses.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tabular-nums">{fmtMoney(monthTotal, currency)}</span>
            {expenses.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-secondary" title="Export">
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => openPreview("pdf")}><FileText className="h-4 w-4" /> Preview PDF <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openPreview("text")}><Copy className="h-4 w-4" /> Preview Text <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportPDF}><Download className="h-4 w-4" /> Download PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Download Excel</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={copyText}><Copy className="h-4 w-4" /> Copy as text</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Category breakdown mini bars */}
        {topCats.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {topCats.map(([catId, amt]) => {
              const cat = getCategory(catId);
              const pct = monthTotal > 0 ? (amt / monthTotal) * 100 : 0;
              return (
                <div key={catId} className="flex items-center gap-2 text-xs">
                  <cat.icon className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
                  <span className="w-16 truncate">{cat.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat.color }} />
                  </div>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">{fmtMoney(amt, currency)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Payment method breakdown */}
        {Object.keys(payBreakdown).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(payBreakdown).sort((a, b) => b[1] - a[1]).map(([pmId, amt]) => {
              const pm = getPaymentMethod(pmId);
              return (
                <span key={pmId} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                  <pm.icon className="h-3 w-3" /> {pm.label}: {fmtMoney(amt, currency)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Search + filters — sticky */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur pb-2 -mx-4 px-4 pt-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search expenses…" className="pl-8 pr-8 h-9" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg bg-secondary p-0.5">
            <button onClick={() => setView("list")} className={cn("grid h-8 w-8 place-items-center rounded-md transition", viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground")} title="List view">
              <LayoutList className="h-4 w-4" />
            </button>
            <button onClick={() => setView("table")} className={cn("grid h-8 w-8 place-items-center rounded-md transition", viewMode === "table" ? "bg-background shadow-sm" : "text-muted-foreground")} title="Table view">
              <TableProperties className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Filter dropdowns */}
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border", filterCat !== "all" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground")}>
                {filterCat === "all" ? "Category" : getCategory(filterCat).label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-60 overflow-y-auto">
              <DropdownMenuItem onClick={() => setFilterCat("all")}>All categories</DropdownMenuItem>
              <DropdownMenuSeparator />
              {CATEGORIES.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => setFilterCat(c.id)}>
                  <c.icon className="h-3.5 w-3.5" style={{ color: c.color }} /> {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn("flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border", filterPay !== "all" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground")}>
                {filterPay === "all" ? "Payment" : getPaymentMethod(filterPay).label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterPay("all")}>All methods</DropdownMenuItem>
              <DropdownMenuSeparator />
              {DEFAULT_PAYMENT_METHODS.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => setFilterPay(m.id)}>
                  <m.icon className="h-3.5 w-3.5" /> {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="h-7 rounded-lg border border-border bg-transparent px-2 text-[11px] text-foreground"
            />
            {filterDate && (
              <button onClick={() => setFilterDate("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expense list / table */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5 hidden md:table-cell">Payment</th>
                <th className="px-3 py-2.5 hidden lg:table-cell">Note</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No expenses {expenses.length > 0 ? "match your filters" : "this month"}.</td></tr>
              )}
              {filtered.sort((a, b) => b.date - a.date).map((e) => {
                const cat = getCategory(e.category);
                const pm = getPaymentMethod(e.paymentMethod);
                return (
                  <tr key={e.id} className="hover:bg-secondary/30 transition">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: `${cat.color}22`, color: cat.color }}>
                          <cat.icon className="h-3 w-3" />
                        </div>
                        <span className="font-medium truncate max-w-[150px] md:max-w-none">{e.description}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{cat.label}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                      <span className="inline-flex items-center gap-1"><pm.icon className="h-3 w-3" /> {pm.label}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell max-w-[150px]">
                      {e.note ? (
                        <span className="truncate block cursor-default" title={e.note}>{e.note}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMoney(e.amount, currency)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-0.5">
                        {e.billImage && (
                          <button onClick={() => setViewBill(e.billImage!)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" title="View bill">
                            <ImageIcon className="h-3 w-3" />
                          </button>
                        )}
                        <button onClick={() => setEditing(e)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeExpense(e.id)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {dayGroups.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">No expenses {expenses.length > 0 ? "match your filters" : "this month"}.</p>
          )}
          {dayGroups.map((d) => (
            <div key={d.ts} className="space-y-1.5">
              <div className="flex items-baseline justify-between border-b border-border/60 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fmtDay(d.ts)}</span>
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{fmtMoney(d.total, currency)}</span>
              </div>
              <div className="md:grid md:grid-cols-2 md:gap-2 space-y-1.5 md:space-y-0">
              {d.items.map((e) => {
                const cat = getCategory(e.category);
                const pm = getPaymentMethod(e.paymentMethod);
                const Icon = cat.icon;
                const PMIcon = pm.icon;
                return (
                  <div key={e.id} className="rounded-xl border border-border bg-card p-3 shadow-card">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${cat.color}22`, color: cat.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="truncate text-sm font-semibold">{e.description}</h4>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(e.amount, currency)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <span className="inline-flex items-center gap-0.5"><PMIcon className="h-3 w-3" /> {pm.label}</span>
                          <span>·</span>
                          <span>{relativeTime(e.date)}</span>
                        </div>
                        {e.note && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{e.note}</p>}
                        <div className="mt-1.5 flex items-center gap-1">
                          {e.billImage && (
                            <button onClick={() => setViewBill(e.billImage!)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                              <ImageIcon className="h-3 w-3" /> Bill
                            </button>
                          )}
                          <button onClick={() => setEditing(e)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button onClick={() => removeExpense(e.id)} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB to add */}
      <Button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 h-12 w-12 rounded-full shadow-elevated p-0"
      >
        <Plus className="h-5 w-5" />
      </Button>

      {/* Add/Edit dialog */}
      {showAdd && (
        <PersonalExpenseDialog open={showAdd} onOpenChange={setShowAdd} defaultCurrency={currency} />
      )}
      {editing && (
        <PersonalExpenseDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initial={editing} defaultCurrency={currency} />
      )}

      {/* Bill view */}
      <Dialog open={!!viewBill} onOpenChange={(o) => !o && setViewBill(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl p-2">
          {viewBill && <img src={viewBill} alt="Bill" className="max-h-[80vh] w-full rounded-lg object-contain bg-secondary" />}
        </DialogContent>
      </Dialog>

      {/* Export preview dialog */}
      <Dialog open={!!previewKind} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[92vh] overflow-hidden p-3 sm:p-5">
          <DialogHeader>
            <DialogTitle className="capitalize">{previewKind} Preview · {monthKeyFullLabel(monthKey)}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-secondary/30">
            {previewKind === "pdf" && pdfUrl && (
              <>
                <object data={pdfUrl} type="application/pdf" className="hidden h-[65vh] w-full bg-white sm:block">
                  <div className="grid h-48 place-items-center p-4 text-center text-xs text-muted-foreground">
                    Inline PDF preview not supported. Use the buttons below.
                  </div>
                </object>
                <div className="grid place-items-center p-6 sm:hidden">
                  <p className="mb-3 text-center text-xs text-muted-foreground">
                    PDF preview isn't supported on mobile. Download below.
                  </p>
                  <Button asChild size="sm" variant="secondary">
                    <a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF in new tab</a>
                  </Button>
                </div>
              </>
            )}
            {previewKind === "text" && (
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed">{buildTextSummary()}</pre>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {previewKind === "text" && (
              <Button variant="secondary" size="sm" onClick={copyText}><Copy className="h-4 w-4" /> Copy</Button>
            )}
            {previewKind === "pdf" && (
              <Button size="sm" onClick={exportPDF}><Download className="h-4 w-4" /> Download PDF</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
