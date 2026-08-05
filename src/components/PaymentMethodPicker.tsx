import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { usePersonal } from "@/store/PersonalStore";
import { getPaymentMethodIcon, ICON_MAP, PAYMENT_ICON_CHOICES } from "@/lib/personal-utils";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";

interface PaymentMethodPickerProps {
  value: string;
  onChange: (id: string) => void;
}

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  const { paymentMethods, addPaymentMethod, removePaymentMethod } = usePersonal();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("default");

  const reset = () => { setNewLabel(""); setNewIcon("default"); setAdding(false); };

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "method";
    const taken = new Set(paymentMethods.map((m) => m.id));
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}_${n++}`;
    await addPaymentMethod({ id, label, icon: newIcon, isDefault: false });
    onChange(id);
    toast.success(`"${label}" added`);
    reset();
  };

  const handleRemove = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      description: "Expenses already using it keep the label but it won't be offered again.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await removePaymentMethod(id);
    if (value === id) onChange(paymentMethods.find((m) => m.id !== id)?.id ?? "cash");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {paymentMethods.map((m) => {
          const Icon = getPaymentMethodIcon(m);
          const active = m.id === value;
          return (
            <div key={m.id} className="relative group">
              <button
                type="button"
                onClick={() => onChange(m.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                  active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
              {!m.isDefault && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.id, m.label)}
                  aria-label={`Delete ${m.label}`}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-card group-hover:grid focus:grid"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add payment method"
            className="flex shrink-0 items-center gap-0.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 flex-1 text-xs"
              placeholder="Method name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value.slice(0, 24))}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") reset(); }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newLabel.trim()}
              aria-label="Save payment method"
              className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancel"
              className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_ICON_CHOICES.map((key) => {
              const Icon = ICON_MAP[key];
              const active = key === newIcon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewIcon(key)}
                  aria-label={key}
                  aria-pressed={active}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg transition",
                    active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
