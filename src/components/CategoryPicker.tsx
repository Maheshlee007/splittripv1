import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useCategories, removeCategory } from "@/lib/categories";
import { CategoryEditorDialog } from "./CategoryEditorDialog";
import { useConfirm } from "./ConfirmDialog";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  value: string;
  onChange: (id: string) => void;
  /** Hide categories flagged excludeFromTotal (trip splits can't use them). */
  hideExcluded?: boolean;
  /** Show the "+ Add" button. */
  allowAdd?: boolean;
  /** Read-only: selection, add and delete are all suppressed. */
  disabled?: boolean;
}

export function CategoryPicker({ value, onChange, hideExcluded = false, allowAdd = true, disabled = false }: CategoryPickerProps) {
  const all = useCategories();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const categories = hideExcluded ? all.filter((c) => !c.excludeFromTotal || c.id === value) : all;

  const handleRemove = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      description: "Expenses already filed under it keep the label but it won't be offered again.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await removeCategory(id);
    if (value === id) onChange("misc");
  };

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((c) => {
          const Icon = c.icon;
          const active = c.id === value;
          return (
            <div key={c.id} className="relative shrink-0 group">
              <button
                type="button"
                onClick={() => onChange(c.id)}
                disabled={disabled}
                title={c.excludeFromTotal ? `${c.label} — not counted in totals` : c.label}
                className={cn(
                  "flex w-full shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition",
                  active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  disabled && "opacity-60"
                )}
              >
                <Icon className="h-3.5 w-3.5" style={active ? undefined : { color: c.color }} />
                {c.label}
              </button>
              {!c.isDefault && !disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(c.id, c.label)}
                  aria-label={`Delete ${c.label}`}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-card group-hover:grid focus:grid"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          );
        })}
        {allowAdd && !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add category"
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      <CategoryEditorDialog open={adding} onOpenChange={setAdding} onSaved={onChange} />
    </>
  );
}
