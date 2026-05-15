import { CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  value: string;
  onChange: (id: string) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition",
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
