import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Group, Expense, Split, SplitMode } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { fmtMoney } from "@/lib/format";
import { computeShareAmount } from "@/lib/balances";
import { cn } from "@/lib/utils";
import { Camera, Image as ImageIcon, X, Users, UserCheck, UserX } from "lucide-react";
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

  const splits: Split[] = useMemo(() => {
    return [...participants].map((id) => ({ memberId: id, value: parseFloat(splitValues[id] ?? "1") || (mode === "equal" ? 0 : 1) }));
  }, [participants, splitValues, mode]);

  const sumExact = mode === "exact" ? splits.reduce((a, b) => a + b.value, 0) : 0;
  const sumPercent = mode === "percent" ? splits.reduce((a, b) => a + b.value, 0) : 0;
  const exactInvalid = mode === "exact" && Math.abs(sumExact - amountNum) > 0.01 && amountNum > 0;
  const percentInvalid = mode === "percent" && Math.abs(sumPercent - 100) > 0.1;

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
    onSave({
      description: desc.trim(),
      amount: amountNum,
      currency: group.currency,
      paidBy,
      category,
      note: note.trim() || undefined,
      splitMode: mode,
      splits,
      billImage,
      date: fromDateInput(expenseDate, initial?.date ?? initial?.createdAt ?? Date.now()),
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title ?? "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Dinner at beach shack" autoFocus />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount ({group.currency})</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Paid by</Label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {group.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Category</Label>
            <div className="mt-1 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = c.id === category;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      "flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition",
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Split among</Label>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-secondary p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium",
                      mode === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">{participants.size} of {group.members.length} included</span>
              <button onClick={allOn} className="ml-auto inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 hover:bg-accent">
                <UserCheck className="h-3 w-3" /> All
              </button>
              <button onClick={allOff} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 hover:bg-accent">
                <UserX className="h-3 w-3" /> None
              </button>
            </div>
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {group.members.map((m) => {
                const checked = participants.has(m.id);
                const owed =
                  checked && amountNum > 0
                    ? computeShareAmount(amountNum, mode, splits, m.id)
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
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                    {checked && mode !== "equal" && (
                      <Input
                        inputMode="decimal"
                        value={splitValues[m.id] ?? ""}
                        onChange={(e) =>
                          setSplitValues((sv) => ({ ...sv, [m.id]: e.target.value.replace(/[^\d.]/g, "") }))
                        }
                        placeholder={mode === "percent" ? "%" : mode === "exact" ? "amt" : "shares"}
                        className="h-8 w-16 sm:w-20 text-right text-sm"
                      />
                    )}
                    <span className={cn("w-16 sm:w-20 text-right text-xs tabular-nums", checked ? "text-foreground" : "text-muted-foreground line-through")}>
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
          </div>

          {/* Full-width: bill + note */}
          <div className="md:col-span-2">
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
                <img src={billImage} alt="Bill" className="max-h-64 w-full object-contain bg-secondary" />
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
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-xs font-medium text-muted-foreground hover:bg-secondary"
              >
                <Camera className="h-4 w-4" /> Attach bill photo
              </button>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">
              Stored locally on this device & synced peer-to-peer. For backup, export the trip as JSON from the menu.
            </p>
          </div>

          <div className="md:col-span-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember…" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>{saveLabel ?? "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
