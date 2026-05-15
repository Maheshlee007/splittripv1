import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPicker } from "@/components/CategoryPicker";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { Camera, X, Image as ImageIcon } from "lucide-react";
import { PersonalExpense, PaymentMethod } from "@/lib/types";
import { deriveMonthKey, compressBillImage } from "@/lib/personal-utils";
import { usePersonal } from "@/store/PersonalStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: PersonalExpense | null;
  defaultCurrency?: string;
}

function toDateInput(ts?: number): string {
  const d = new Date(ts ?? Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromDateInput(dateStr: string, fallback: number): number {
  const d = new Date(dateStr + "T12:00:00");
  return isNaN(d.getTime()) ? fallback : d.getTime();
}

export function PersonalExpenseDialog({ open, onOpenChange, initial, defaultCurrency = "INR" }: Props) {
  const { addExpense, updateExpense } = usePersonal();
  const isEdit = !!initial;

  const [desc, setDesc] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [category, setCategory] = useState(initial?.category ?? "food");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "upi");
  const [expenseDate, setExpenseDate] = useState(toDateInput(initial?.date));
  const [note, setNote] = useState(initial?.note ?? "");
  const [billImage, setBillImage] = useState<string | undefined>(initial?.billImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const amountNum = parseFloat(amount) || 0;
  const canSave = desc.trim().length > 0 && amountNum > 0;

  const handleFile = async (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressBillImage(reader.result as string, 500);
      setBillImage(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const now = Date.now();
    const dateTs = fromDateInput(expenseDate, initial?.date ?? now);
    const expense: PersonalExpense = {
      id: initial?.id ?? crypto.randomUUID(),
      description: desc.trim(),
      amount: amountNum,
      currency: defaultCurrency,
      category,
      paymentMethod,
      date: dateTs,
      monthKey: deriveMonthKey(dateTs),
      note: note.trim() || undefined,
      billImage,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    if (isEdit) {
      await updateExpense(expense);
    } else {
      await addExpense(expense);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-full max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>{isEdit ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Coffee, groceries, rent…" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Amount ({defaultCurrency})</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Payment method</Label>
            <div className="mt-1">
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
            </div>
          </div>

          <div>
            <Label>Category</Label>
            <div className="mt-1">
              <CategoryPicker value={category} onChange={setCategory} />
            </div>
          </div>

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
                <img src={billImage} alt="Bill" className="max-h-32 w-full object-contain bg-secondary" />
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
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary"
              >
                <Camera className="h-4 w-4" /> Attach photo
              </button>
            )}
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Extra details…" />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>{isEdit ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
