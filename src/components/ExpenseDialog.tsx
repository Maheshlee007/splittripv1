import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Group, Expense, Split, SplitMode, ExpenseKind } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { fmtMoney } from "@/lib/format";
import { computeShareAmount } from "@/lib/balances";
import { cn } from "@/lib/utils";
import { Camera, Image as ImageIcon, X, Users, UserCheck, UserX, Banknote } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: Group;
  defaultPaidBy?: string;
  initial?: Expense;
  onSave: (e: Omit<Expense, "id" | "createdAt" | "updatedAt" | "createdBy">) => void;
  saveLabel?: string;
  title?: string;
}

const MODES: { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "shares", label: "Shares" },
  { id: "exact", label: "Exact" },
  { id: "percent", label: "%" },
];

const EXPENSE_KINDS: { id: ExpenseKind; label: string; hint: string }[] = [
  { id: "general", label: "General", hint: "Normal expense" },
  { id: "advance_common", label: "Advance-common", hint: "Expense + advance tracking" },
  { id: "pre_advance", label: "Pre-advance", hint: "Advance top-up only" },
];

function kindFromExpense(e?: Expense): ExpenseKind {
  if (!e) return "general";
  if (e.expenseKind) return e.expenseKind;
  return e.isAdvance ? "advance_common" : "general";
}

async function fileToDataUrl(file: File, maxW = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toDateInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromDateInput(s: string, fallback: number): number {
  if (!s) return fallback;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(fallback);
  dt.setFullYear(y, (m || 1) - 1, d || 1);
  return dt.getTime();
}

export function ExpenseDialog({ open, onOpenChange, group, defaultPaidBy, initial, onSave, saveLabel, title }: Props) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [paidBy, setPaidBy] = useState<string>(defaultPaidBy ?? group.members[0]?.id ?? "");
  const [category, setCategory] = useState("food");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [participants, setParticipants] = useState<Set<string>>(new Set(group.members.map((m) => m.id)));
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [billImage, setBillImage] = useState<string | undefined>();
  const [expenseDate, setExpenseDate] = useState<string>(toDateInput(Date.now()));
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>("general");
  const [advancePaid, setAdvancePaid] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (initial) {
        setDesc(initial.description);
        setAmount(String(initial.amount));
        setPaidBy(initial.paidBy);
        setCategory(initial.category);
        setMode(initial.splitMode);
        setParticipants(new Set(initial.splits.map((s) => s.memberId)));
        setSplitValues(Object.fromEntries(initial.splits.map((s) => [s.memberId, String(s.value)])));
        setNote(initial.note ?? "");
        setBillImage(initial.billImage);
        setExpenseDate(toDateInput(initial.createdAt));
        setExpenseKind(kindFromExpense(initial));
        setAdvancePaid(new Set((initial.advancePayments ?? []).filter(a => a.hasPaid).map(a => a.memberId)));
      } else {
        setDesc("");
        setAmount("");
        setPaidBy(defaultPaidBy ?? group.members[0]?.id ?? "");
        setCategory("food");
        setMode("equal");
        setParticipants(new Set(group.members.map((m) => m.id)));
        setSplitValues({});
        setNote("");
        setBillImage(undefined);
        setExpenseDate(toDateInput(Date.now()));
        setExpenseKind("general");
        setAdvancePaid(new Set());
      }
    }
  }, [open, initial, defaultPaidBy, group.members]);

  // Reconcile when members are removed mid-edit (or sync brings change)
  useEffect(() => {
    if (!open) return;
    const ids = new Set(group.members.map((m) => m.id));
    setParticipants((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setPaidBy((p) => (ids.has(p) ? p : group.members[0]?.id ?? ""));
  }, [open, group.members]);

  const amountNum = parseFloat(amount) || 0;
  const effectiveAmount = expenseKind === "pre_advance" ? amountNum * participants.size : amountNum;

  const splits: Split[] = useMemo(() => {
    return [...participants].map((id) => ({ memberId: id, value: parseFloat(splitValues[id] ?? "1") || (mode === "equal" ? 0 : 1) }));
  }, [participants, splitValues, mode]);

  const sumExact = mode === "exact" ? splits.reduce((a, b) => a + b.value, 0) : 0;
  const sumPercent = mode === "percent" ? splits.reduce((a, b) => a + b.value, 0) : 0;
  const exactInvalid = expenseKind !== "pre_advance" && mode === "exact" && Math.abs(sumExact - amountNum) > 0.01 && amountNum > 0;
  const percentInvalid = expenseKind !== "pre_advance" && mode === "percent" && Math.abs(sumPercent - 100) > 0.1;

  const canSave = desc.trim() && amountNum > 0 && participants.size > 0 && !exactInvalid && !percentInvalid;

  const toggleP = (id: string) => {
    const n = new Set(participants);
    n.has(id) ? n.delete(id) : n.add(id);
    setParticipants(n);
  };
  const allOn = () => setParticipants(new Set(group.members.map((m) => m.id)));
  const allOff = () => setParticipants(new Set());

  const handleFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("Image too large (max 8 MB)"); return; }
    try {
      const data = await fileToDataUrl(f);
      setBillImage(data);
    } catch {
      toast.error("Couldn't read image");
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    const advancePayments = expenseKind !== "general"
      ? [...participants].map(memberId => ({
          memberId,
          hasPaid: expenseKind === "pre_advance" ? true : advancePaid.has(memberId),
          paidAt: expenseKind === "pre_advance" || advancePaid.has(memberId) ? Date.now() : undefined,
        }))
      : undefined;
    onSave({
      description: desc.trim(),
      amount: effectiveAmount,
      currency: group.currency,
      paidBy: expenseKind === "pre_advance" ? (group.ownerId || paidBy) : paidBy,
      category: expenseKind === "general" ? category : "advance",
      note: note.trim() || undefined,
      splitMode: expenseKind === "pre_advance" ? "equal" : mode,
      splits,
      billImage,
      date: fromDateInput(expenseDate, initial?.date ?? initial?.createdAt ?? Date.now()),
      expenseKind,
      isAdvance: expenseKind !== "general" || undefined,
      advancePayments,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-full max-w-[calc(100vw-1rem)] sm:max-w-4xl max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
          <DialogTitle>{title ?? "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr,1fr]">
            {/* LEFT COLUMN — expense details */}
            <div className="space-y-3">
              <div>
                <Label>Description</Label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Dinner at beach shack" autoFocus />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <Label>{expenseKind === "pre_advance" ? `Per-member amount (${group.currency})` : `Amount (${group.currency})`}</Label>
                  <Input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="mt-2 h-10 text-sm"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>Paid by</Label>
                  <select
                    value={expenseKind === "pre_advance" ? (group.ownerId || paidBy) : paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    disabled={expenseKind === "pre_advance"}
                    className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                  >
                    {group.members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {expenseKind === "pre_advance" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Not needed for pre-advance. Members selected below are treated as contributors.</p>
                  )}
                </div>
              </div>

              <div>
                <Label>Expense type</Label>
                <select
                  value={expenseKind}
                  onChange={(e) => {
                    const next = e.target.value as ExpenseKind;
                    setExpenseKind(next);
                    const nextAdvance = next !== "general";
                    if (nextAdvance) setCategory("advance");
                    if (next === "pre_advance") {
                      setMode("equal");
                      setParticipants(new Set());
                      setAdvancePaid(new Set());
                      setPaidBy(group.ownerId || paidBy);
                      if (!note.trim()) setNote("Pre-advance top-up");
                    } else if (next === "advance_common") {
                      setAdvancePaid(new Set([...participants]));
                      if (!note.trim()) setNote("Advance collection");
                    } else {
                      if (note === "Advance collection" || note === "Pre-advance top-up") setNote("");
                      setAdvancePaid(new Set());
                    }
                  }}
                  className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {EXPENSE_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {EXPENSE_KINDS.find((k) => k.id === expenseKind)?.hint}
                </p>
                {expenseKind === "pre_advance" && participants.size > 0 && (
                  <p className="mt-1 text-[11px] text-warning">
                    Total advance recorded: {fmtMoney(effectiveAmount, group.currency)} ({participants.size} x {fmtMoney(amountNum, group.currency)})
                  </p>
                )}
              </div>

              <div>
                <Label>Category</Label>
                <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {CATEGORIES.map((c) => {
                    const Icon = c.icon;
                    const active = c.id === category;
                    return (
                      <button
                        key={c.id}
                        onClick={() => expenseKind === "general" && setCategory(c.id)}
                        className={cn(
                          "flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition",
                          active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        )}
                        disabled={expenseKind !== "general"}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                {expenseKind !== "general" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Advance types are automatically saved under Advance category.</p>
                )}
              </div>

              {/* Bill + note (visible on desktop below left col, on mobile it shows after split) */}
              <div className="hidden md:block space-y-3">
                <div>
                  <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Bill photo (optional)</Label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  {billImage ? (
                    <div className="relative mt-1 overflow-hidden rounded-xl border border-border">
                      <img src={billImage} alt="Bill" className="max-h-40 w-full object-contain bg-secondary" />
                      <button
                        onClick={() => setBillImage(undefined)}
                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-destructive shadow-card hover:bg-destructive/10"
                        aria-label="Remove bill photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                    >
                      <Camera className="h-4 w-4" /> Attach bill photo
                    </button>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Stored locally & synced peer-to-peer.
                  </p>
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember…" />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — split members */}
            <div>
              <div className="flex flex-col items-start justify-center  gap-2 mb-2">
                <Label className="flex items-center  gap-1.5"><Users className="h-3.5 w-3.5" /> Split among</Label>
                <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-secondary p-0.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => expenseKind !== "pre_advance" && setMode(m.id)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-medium",
                        mode === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                      )}
                      disabled={expenseKind === "pre_advance"}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {expenseKind === "pre_advance" && (
                <p className="mb-2 text-[11px] text-muted-foreground">Pre-advance always uses equal split so each selected member contributes the same amount.</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">{participants.size} of {group.members.length} included</span>
                <button onClick={allOn} className="ml-auto inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 hover:bg-accent">
                  <UserCheck className="h-3 w-3" /> All
                </button>
                <button onClick={allOff} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 hover:bg-accent">
                  <UserX className="h-3 w-3" /> None
                </button>
              </div>
              <div className="mt-2 max-h-52 md:max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {group.members.map((m) => {
                  const checked = participants.has(m.id);
                  const owed =
                    checked && amountNum > 0
                      ? computeShareAmount(effectiveAmount, expenseKind === "pre_advance" ? "equal" : mode, splits, m.id)
                      : 0;
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition",
                        checked ? "bg-primary/5" : "opacity-60 hover:opacity-100 hover:bg-secondary/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleP(m.id)}
                        className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                      {checked && expenseKind !== "pre_advance" && mode !== "equal" && (
                        <Input
                          inputMode="decimal"
                          value={splitValues[m.id] ?? ""}
                          onChange={(e) =>
                            setSplitValues((sv) => ({ ...sv, [m.id]: e.target.value.replace(/[^\d.]/g, "") }))
                          }
                          placeholder={mode === "percent" ? "%" : mode === "exact" ? "amt" : "shares"}
                          className="h-8 w-14 text-right text-sm"
                        />
                      )}
                      <span className={cn("w-16 shrink-0 text-right text-xs tabular-nums", checked ? "text-foreground" : "text-muted-foreground line-through")}>
                        {checked ? fmtMoney(owed, group.currency) : "excluded"}
                      </span>
                    </label>
                  );
                })}
              </div>
              {exactInvalid && (
                <p className="mt-1 text-xs text-destructive">
                  Sum {fmtMoney(sumExact, group.currency)} must equal {fmtMoney(amountNum, group.currency)}
                </p>
              )}
              {percentInvalid && (
                <p className="mt-1 text-xs text-destructive">Percentages must add to 100 (currently {sumPercent.toFixed(1)}%)</p>
              )}

              {/* Advance collection: who has paid their share */}
              {expenseKind === "advance_common" && participants.size > 0 && (
                <div className="mt-3 rounded-xl border border-success/30 bg-success/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-4 w-4 text-success" />
                    <span className="text-xs font-semibold">Advance paid by</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {advancePaid.size}/{participants.size}
                    </span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setAdvancePaid(new Set([...participants]))}
                      className="flex-1 rounded-md bg-success/20 px-2 py-1 text-[10px] font-medium text-success hover:bg-success/30 transition"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setAdvancePaid(new Set())}
                      className="flex-1 rounded-md bg-destructive/20 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/30 transition"
                    >
                      None
                    </button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {group.members.filter(m => participants.has(m.id)).map((m) => {
                      const paid = advancePaid.has(m.id);
                      const share = amountNum > 0 ? computeShareAmount(effectiveAmount, mode, splits, m.id) : 0;
                      return (
                        <label
                          key={m.id}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition",
                            paid ? "bg-success/10" : "hover:bg-secondary/50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={paid}
                            onChange={() => {
                              setAdvancePaid(prev => {
                                const next = new Set(prev);
                                paid ? next.delete(m.id) : next.add(m.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 shrink-0 accent-[hsl(145,70%,40%)]"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                          <span className={cn("text-xs font-medium tabular-nums", paid ? "text-success" : "text-muted-foreground")}>
                            {paid ? `✓ ${fmtMoney(share, group.currency)}` : "Not paid"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {amountNum > 0 && (
                    <div className="mt-2 pt-2 border-t border-success/20 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Collected</span>
                      <span className="font-semibold text-success">
                        {fmtMoney(
                          [...advancePaid].reduce((sum, id) => sum + computeShareAmount(amountNum, mode, splits, id), 0),
                          group.currency
                        )}
                        <span className="text-muted-foreground font-normal"> / {fmtMoney(effectiveAmount, group.currency)}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {expenseKind === "pre_advance" && participants.size > 0 && (
                <div className="mt-3 rounded-xl border border-success/30 bg-success/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-4 w-4 text-success" />
                    <span className="text-xs font-semibold">Pre-advance contributors</span>
                    <span className="ml-auto text-[10px] text-success">{participants.size}/{participants.size} paid</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {group.members.filter((m) => participants.has(m.id)).map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded-lg bg-success/10 px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                        <span className="text-xs font-medium tabular-nums text-success">✓ {fmtMoney(amountNum, group.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-success/20 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total added to advance</span>
                    <span className="font-semibold text-success">{fmtMoney(effectiveAmount, group.currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile-only: bill + note (below split section) */}
            <div className="md:hidden space-y-3">
              <div>
                <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Bill photo (optional)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {billImage ? (
                  <div className="relative mt-1 overflow-hidden rounded-xl border border-border">
                    <img src={billImage} alt="Bill" className="max-h-40 w-full object-contain bg-secondary" />
                    <button
                      onClick={() => setBillImage(undefined)}
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-destructive shadow-card hover:bg-destructive/10"
                      aria-label="Remove bill photo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                  >
                    <Camera className="h-4 w-4" /> Attach bill photo
                  </button>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Stored locally & synced peer-to-peer.
                </p>
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember…" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>{saveLabel ?? "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
