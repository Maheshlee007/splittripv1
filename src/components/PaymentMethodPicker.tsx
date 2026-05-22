import { useState } from "react";
import { Plus } from "lucide-react";
import { usePersonal } from "@/store/PersonalStore";
import { getPaymentMethodIcon } from "@/lib/personal-utils";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface PaymentMethodPickerProps {
  value: string;
  onChange: (id: string) => void;
}

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  const { paymentMethods, addPaymentMethod } = usePersonal();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, "_");
    await addPaymentMethod({ id, label, isDefault: false });
    onChange(id);
    setNewLabel("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {paymentMethods.map((m) => {
        const Icon = getPaymentMethodIcon(m);
        const active = m.id === value;
        return (
          <button
            key={m.id}
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
        );
      })}
      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-24 text-xs"
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            autoFocus
          />
          <button type="button" onClick={handleAdd} className="text-[11px] font-medium text-primary">Add</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium bg-secondary text-muted-foreground hover:text-foreground transition"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      )}
    </div>
  );
}
