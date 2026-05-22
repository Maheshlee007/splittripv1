import { useState, useMemo } from "react";
import { usePersonal } from "@/store/PersonalStore";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { Plus, ArrowUpRight, ArrowDownLeft, Check, Undo2, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lending } from "@/lib/types";

type Direction = "owed_to_me" | "i_owe";

export default function LendingPage() {
  const { lendings, addLending, updateLending, removeLending } = usePersonal();
  const { profile } = useApp();
  const currency = profile.defaultCurrency ?? "INR";

  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<"pending" | "settled">("pending");

  const pending = useMemo(() => lendings.filter((l) => l.status !== "settled"), [lendings]);
  const settled = useMemo(() => lendings.filter((l) => l.status === "settled"), [lendings]);
  const display = tab === "pending" ? pending : settled;

  const owedToMe = useMemo(() => pending.filter((l) => l.direction === "owed_to_me").reduce((s, l) => s + l.amount - (l.partialAmount ?? 0), 0), [pending]);
  const iOwe = useMemo(() => pending.filter((l) => l.direction === "i_owe").reduce((s, l) => s + l.amount - (l.partialAmount ?? 0), 0), [pending]);

  const handleSettle = async (l: Lending) => {
    await updateLending({ ...l, status: "settled", settledAt: Date.now() });
  };

  const handleUnsettle = async (l: Lending) => {
    await updateLending({ ...l, status: "pending", settledAt: undefined });
  };

  return (
    <>
      <PageHeader title="Lending" subtitle="Track who owes whom" actions={
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      } />

      <div className="px-4 py-5 md:px-6 lg:px-8 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowDownLeft className="h-4 w-4 text-success" />
              <span className="uppercase tracking-wider font-medium">Owed to me</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-success">{fmtMoney(owedToMe, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pending.filter(l => l.direction === "owed_to_me").length} people</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowUpRight className="h-4 w-4 text-destructive" />
              <span className="uppercase tracking-wider font-medium">I owe</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-destructive">{fmtMoney(iOwe, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pending.filter(l => l.direction === "i_owe").length} people</p>
          </div>
          <div className="col-span-2 md:col-span-1 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <HandCoins className="h-4 w-4 text-primary" />
              <span className="uppercase tracking-wider font-medium">Net</span>
            </div>
            <p className={cn("text-xl font-bold tabular-nums", owedToMe - iOwe >= 0 ? "text-success" : "text-destructive")}>
              {owedToMe - iOwe >= 0 ? "+" : ""}{fmtMoney(Math.abs(owedToMe - iOwe), currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{pending.length} total pending</p>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-lg bg-secondary p-0.5">
          <button
            onClick={() => setTab("pending")}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition", tab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("settled")}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition", tab === "settled" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Settled ({settled.length})
          </button>
        </div>

        {/* List */}
        <div className="space-y-2">
          {display.length === 0 && (
            <div className="py-12 text-center rounded-2xl border border-dashed border-border bg-card/50">
              {tab === "pending" ? (
                <>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <HandCoins className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-sm font-medium">No pending lendings</p>
                  <p className="mt-1 text-xs text-muted-foreground">Track money people owe you, or that you owe others.</p>
                  <Button className="mt-4 gap-1.5" onClick={() => setShowAdd(true)}>
                    <Plus className="h-4 w-4" /> Add a lending
                  </Button>
                </>
              ) : (
                <>
                  <Check className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">No settled lendings yet.</p>
                </>
              )}
            </div>
          )}
          {display.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
              <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", l.direction === "owed_to_me" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                {l.direction === "owed_to_me" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.personName}</p>
                {l.reason && <p className="truncate text-[11px] text-muted-foreground">{l.reason}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(l.date).toLocaleDateString()}{l.dueDate ? ` · Due ${new Date(l.dueDate).toLocaleDateString()}` : ""}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-bold tabular-nums", l.direction === "owed_to_me" ? "text-success" : "text-destructive")}>
                  {fmtMoney(l.amount, currency)}
                </p>
                {l.status === "settled" ? (
                  <button onClick={() => handleUnsettle(l)} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    <Undo2 className="h-3 w-3" /> Undo
                  </button>
                ) : (
                  <button onClick={() => handleSettle(l)} className="mt-1 text-[10px] text-primary font-medium hover:underline flex items-center gap-0.5">
                    <Check className="h-3 w-3" /> Settle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddLendingDialog open={showAdd} onOpenChange={setShowAdd} currency={currency} />
    </>
  );
}

function AddLendingDialog({ open, onOpenChange, currency }: { open: boolean; onOpenChange: (v: boolean) => void; currency: string }) {
  const { addLending } = usePersonal();
  const [personName, setPersonName] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("owed_to_me");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");

  const canSave = personName.trim().length > 0 && parseFloat(amount) > 0;

  const handleSave = async () => {
    const lending: Lending = {
      id: crypto.randomUUID(),
      personName: personName.trim(),
      personPhone: personPhone.trim() || undefined,
      amount: parseFloat(amount),
      currency,
      direction,
      reason: reason.trim() || undefined,
      date: Date.now(),
      dueDate: dueDate ? new Date(dueDate + "T12:00:00").getTime() : undefined,
      status: "pending",
      createdAt: Date.now(),
    };
    await addLending(lending);
    onOpenChange(false);
    // Reset form
    setPersonName("");
    setPersonPhone("");
    setAmount("");
    setDirection("owed_to_me");
    setReason("");
    setDueDate("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add lending</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Direction toggle */}
          <div className="flex rounded-lg bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => setDirection("owed_to_me")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition", direction === "owed_to_me" ? "bg-background text-success shadow-sm" : "text-muted-foreground")}
            >
              <ArrowDownLeft className="h-4 w-4" /> They owe me
            </button>
            <button
              type="button"
              onClick={() => setDirection("i_owe")}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition", direction === "i_owe" ? "bg-background text-destructive shadow-sm" : "text-muted-foreground")}
            >
              <ArrowUpRight className="h-4 w-4" /> I owe them
            </button>
          </div>

          <div>
            <Label>Person name *</Label>
            <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Who?" autoFocus />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input inputMode="tel" value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} placeholder="+91 9876543210" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Amount ({currency}) *</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lunch, loan, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!canSave} className="w-full">Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
