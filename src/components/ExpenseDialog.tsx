import { useEffect, useMemo, useState } from "react";
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

export function ExpenseDialog({ open, onOpenChange, group, defaultPaidBy, initial, onSave, saveLabel, title }: Props) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [paidBy, setPaidBy] = useState<string>(defaultPaidBy ?? group.members[0]?.id ?? "");
  const [category, setCategory] = useState("food");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [participants, setParticipants] = useState<Set<string>>(new Set(group.members.map((m) => m.id)));
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

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
      } else {
        setDesc("");
        setAmount("");
        setPaidBy(defaultPaidBy ?? group.members[0]?.id ?? "");
        setCategory("food");
        setMode("equal");
        setParticipants(new Set(group.members.map((m) => m.id)));
        setSplitValues({});
        setNote("");
      }
    }
  }, [open, initial, defaultPaidBy, group.members]);

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
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Dinner at beach shack" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="flex items-center justify-between">
              <Label>Split</Label>
              <div className="flex gap-1 rounded-lg bg-secondary p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      mode === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 space-y-1.5 rounded-xl border border-border p-2">
              {group.members.map((m) => {
                const checked = participants.has(m.id);
                const owed =
                  checked && amountNum > 0
                    ? computeShareAmount(amountNum, mode, splits, m.id)
                    : 0;
                return (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleP(m.id)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span className="flex-1 text-sm">{m.name}</span>
                    {checked && mode !== "equal" && (
                      <Input
                        inputMode="decimal"
                        value={splitValues[m.id] ?? ""}
                        onChange={(e) =>
                          setSplitValues((sv) => ({ ...sv, [m.id]: e.target.value.replace(/[^\d.]/g, "") }))
                        }
                        placeholder={mode === "percent" ? "%" : mode === "exact" ? "amt" : "shares"}
                        className="h-8 w-20 text-right text-sm"
                      />
                    )}
                    {checked && (
                      <span className="w-20 text-right text-xs text-muted-foreground">
                        {fmtMoney(owed, group.currency)}
                      </span>
                    )}
                  </div>
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

          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>{saveLabel ?? "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
