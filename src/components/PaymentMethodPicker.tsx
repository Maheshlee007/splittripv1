import { PAYMENT_METHODS } from "@/lib/personal-utils";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (id: PaymentMethod) => void;
}

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
      {PAYMENT_METHODS.map((m) => {
        const Icon = m.icon;
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
    </div>
  );
}
