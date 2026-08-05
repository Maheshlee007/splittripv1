import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CATEGORY_ICON_MAP, CATEGORY_COLORS, FALLBACK_ICON_KEY,
  addCategory, makeCategoryId, useCategories,
} from "@/lib/categories";
import type { CustomCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing custom category to edit; omit to create a new one. */
  initial?: CustomCategory | null;
  /** Called with the saved category id. */
  onSaved?: (id: string) => void;
}

const ICON_KEYS = Object.keys(CATEGORY_ICON_MAP);

export function CategoryEditorDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const categories = useCategories();
  const isEdit = !!initial;

  const [label, setLabel] = useState("");
  const [iconKey, setIconKey] = useState(FALLBACK_ICON_KEY);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [excludeFromTotal, setExcludeFromTotal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setIconKey(initial?.icon ?? FALLBACK_ICON_KEY);
    setColor(initial?.color ?? CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
    setExcludeFromTotal(!!initial?.excludeFromTotal);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const trimmed = label.trim();
  const duplicate = !isEdit && categories.some((c) => c.label.toLowerCase() === trimmed.toLowerCase());
  const canSave = trimmed.length > 0 && !duplicate && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const cat: CustomCategory = {
      id: initial?.id ?? makeCategoryId(trimmed),
      label: trimmed,
      icon: iconKey,
      color,
      excludeFromTotal,
      createdAt: initial?.createdAt ?? Date.now(),
    };
    try {
      await addCategory(cat);
      onSaved?.(cat.id);
      toast.success(isEdit ? "Category updated" : `"${cat.label}" added`);
      onOpenChange(false);
    } catch {
      toast.error("Could not save category");
      setSaving(false);
    }
  };

  const PreviewIcon = CATEGORY_ICON_MAP[iconKey] ?? CATEGORY_ICON_MAP[FALLBACK_ICON_KEY];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-full max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Live preview + name */}
          <div className="flex items-end gap-3">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{ background: `${color}22`, color }}
            >
              <PreviewIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <Label>Name</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 24))}
                placeholder="Groceries, EMI, Subscriptions…"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
          </div>
          {duplicate && <p className="text-[11px] text-destructive">A category with that name already exists.</p>}

          <div>
            <Label>Icon</Label>
            <div className="mt-1.5 grid grid-cols-8 gap-1.5 rounded-xl border border-border p-2 max-h-40 overflow-y-auto">
              {ICON_KEYS.map((key) => {
                const Icon = CATEGORY_ICON_MAP[key];
                const active = key === iconKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIconKey(key)}
                    aria-label={key}
                    aria-pressed={active}
                    className={cn(
                      "grid aspect-square place-items-center rounded-lg transition",
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Colour</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === color}
                  className={cn(
                    "h-7 w-7 rounded-full transition",
                    c === color ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/60" : "hover:scale-110"
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="min-w-0">
              <Label className="cursor-pointer" htmlFor="exclude-total">Don't count in totals</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Amounts stay on record but are left out of month and year totals — use this for
                transfers or bill repayments like CC Paid.
              </p>
            </div>
            <Switch id="exclude-total" checked={excludeFromTotal} onCheckedChange={setExcludeFromTotal} />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>{isEdit ? "Save" : "Add category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
