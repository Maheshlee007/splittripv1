import { useSyncExternalStore } from "react";
import {
  Baby, Banknote, Bed, Beer, Bike, Book, Briefcase, Building2, Bus, Cake, Car, Church,
  Cigarette, Coffee, CreditCard, Droplet, Dumbbell, Film, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Heart, Home, Landmark, MoreHorizontal, Music, PawPrint, PiggyBank, Pill,
  Plane, Receipt, Scissors, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  Stethoscope, Ticket, TrainFront, Tv, Umbrella, Users, UtensilsCrossed, Wifi, Wrench, Zap,
} from "lucide-react";
import type { CustomCategory } from "./types";
import { loadCategories, saveCategory, deleteCategory as deleteCategoryFromDB } from "./storage";

export type CategoryIcon = typeof UtensilsCrossed;

/** Every icon a category can use. Keys are persisted, so never rename one. */
export const CATEGORY_ICON_MAP: Record<string, CategoryIcon> = {
  "utensils-crossed": UtensilsCrossed, "beer": Beer, "cake": Cake, "cigarette": Cigarette,
  "bed": Bed, "home": Home, "building": Building2,
  "car": Car, "fuel": Fuel, "plane": Plane, "train": TrainFront, "bus": Bus, "bike": Bike,
  "ticket": Ticket, "shopping-bag": ShoppingBag, "shopping-cart": ShoppingCart, "shirt": Shirt,
  "gift": Gift, "heart": Heart, "stethoscope": Stethoscope, "pill": Pill, "dumbbell": Dumbbell,
  "graduation-cap": GraduationCap, "book": Book, "baby": Baby, "paw-print": PawPrint,
  "wifi": Wifi, "smartphone": Smartphone, "zap": Zap, "droplet": Droplet, "flame": Flame,
  "wrench": Wrench, "scissors": Scissors, "film": Film, "music": Music, "gamepad": Gamepad2,
  "tv": Tv, "umbrella": Umbrella, "church": Church, "credit-card": CreditCard,
  "landmark": Landmark, "piggy-bank": PiggyBank, "banknote": Banknote, "receipt": Receipt,
  "briefcase": Briefcase, "users": Users, "sparkles": Sparkles, "coffee": Coffee,
  "more-horizontal": MoreHorizontal,
};

/** Palette offered when creating a category. */
export const CATEGORY_COLORS = [
  "hsl(22 95% 53%)", "hsl(280 80% 60%)", "hsl(200 90% 55%)", "hsl(160 70% 45%)",
  "hsl(0 80% 60%)", "hsl(45 95% 55%)", "hsl(330 80% 60%)", "hsl(220 80% 60%)",
  "hsl(30 60% 45%)", "hsl(145 70% 40%)", "hsl(260 60% 55%)", "hsl(190 65% 40%)",
  "hsl(95 55% 42%)", "hsl(350 70% 50%)", "hsl(220 8% 50%)",
];

export const FALLBACK_ICON_KEY = "more-horizontal";
export const FALLBACK_COLOR = "hsl(220 8% 50%)";

/** Categories that ship with the app. Order drives the picker. */
export const BUILTIN_CATEGORIES: CustomCategory[] = [
  { id: "food", label: "Food", icon: "utensils-crossed", color: "hsl(22 95% 53%)", isDefault: true },
  { id: "drinks", label: "Drinks", icon: "beer", color: "hsl(280 80% 60%)", isDefault: true },
  { id: "stay", label: "Stay", icon: "bed", color: "hsl(200 90% 55%)", isDefault: true },
  { id: "rent", label: "Rent", icon: "home", color: "hsl(260 60% 55%)", isDefault: true },
  { id: "travel", label: "Travel", icon: "car", color: "hsl(160 70% 45%)", isDefault: true },
  { id: "fuel", label: "Fuel", icon: "fuel", color: "hsl(0 80% 60%)", isDefault: true },
  { id: "tickets", label: "Tickets", icon: "ticket", color: "hsl(45 95% 55%)", isDefault: true },
  { id: "shopping", label: "Shopping", icon: "shopping-bag", color: "hsl(330 80% 60%)", isDefault: true },
  { id: "flight", label: "Flight", icon: "plane", color: "hsl(220 80% 60%)", isDefault: true },
  { id: "cafe", label: "Café", icon: "coffee", color: "hsl(30 60% 45%)", isDefault: true },
  { id: "advance", label: "Advance", icon: "banknote", color: "hsl(145 70% 40%)", isDefault: true },
  { id: "cc_paid", label: "CC Paid", icon: "credit-card", color: "hsl(190 65% 40%)", isDefault: true, excludeFromTotal: true },
  { id: "misc", label: "Misc", icon: "more-horizontal", color: "hsl(220 8% 50%)", isDefault: true },
];

/** A category with its icon resolved to a renderable component. */
export interface ResolvedCategory {
  id: string;
  label: string;
  icon: CategoryIcon;
  color: string;
  isDefault: boolean;
  excludeFromTotal: boolean;
}

export function resolveCategory(c: CustomCategory): ResolvedCategory {
  return {
    id: c.id,
    label: c.label,
    icon: CATEGORY_ICON_MAP[c.icon ?? FALLBACK_ICON_KEY] ?? MoreHorizontal,
    color: c.color ?? FALLBACK_COLOR,
    isDefault: !!c.isDefault,
    excludeFromTotal: !!c.excludeFromTotal,
  };
}

/* ---------------------------------------------------------------------------
 * Registry
 *
 * Categories are shared by the trip views (inside AppStore) and the personal
 * tracker (inside PersonalStore), so they live in a module-level store that
 * components read via useSyncExternalStore rather than in one React context.
 * ------------------------------------------------------------------------- */

let customCategories: CustomCategory[] = [];
let snapshot: ResolvedCategory[] = BUILTIN_CATEGORIES.map(resolveCategory);
const listeners = new Set<() => void>();

function rebuild() {
  const merged = [...BUILTIN_CATEGORIES];
  for (const c of customCategories) {
    const i = merged.findIndex((m) => m.id === c.id);
    if (i === -1) merged.push(c); else merged[i] = { ...merged[i], ...c };
  }
  snapshot = merged.map(resolveCategory);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return snapshot;
}

let initPromise: Promise<void> | null = null;

/** Idempotent — loads persisted custom categories and notifies subscribers. */
export function initCategories(): Promise<void> {
  if (!initPromise) {
    initPromise = loadCategories()
      .then((cats) => {
        customCategories = cats;
        rebuild();
      })
      .catch(() => { /* fall back to built-ins */ });
  }
  return initPromise;
}

/** All categories, built-in first, with icons resolved. */
export function getAllCategories(): ResolvedCategory[] {
  void initCategories();
  return snapshot;
}

/**
 * Look up a category by id. Unknown ids (e.g. a custom category created on a
 * peer's device) render with a readable label instead of collapsing to "Misc".
 */
export function getCategory(id: string): ResolvedCategory {
  void initCategories();
  const found = snapshot.find((c) => c.id === id);
  if (found) return found;
  if (!id) return snapshot[snapshot.length - 1];
  return {
    id,
    label: prettifyId(id),
    icon: MoreHorizontal,
    color: FALLBACK_COLOR,
    isDefault: false,
    excludeFromTotal: false,
  };
}

/** True when this category's amounts must be kept out of spend totals. */
export function isExcludedCategory(id: string): boolean {
  return getCategory(id).excludeFromTotal;
}

function prettifyId(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Slug for a user-typed label, de-duplicated against existing ids. */
export function makeCategoryId(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "category";
  const taken = new Set(snapshot.map((c) => c.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export async function addCategory(cat: CustomCategory): Promise<void> {
  await initCategories();
  await saveCategory(cat);
  const i = customCategories.findIndex((c) => c.id === cat.id);
  if (i === -1) customCategories = [...customCategories, cat];
  else customCategories = customCategories.map((c) => (c.id === cat.id ? cat : c));
  rebuild();
}

export async function removeCategory(id: string): Promise<void> {
  await initCategories();
  await deleteCategoryFromDB(id);
  customCategories = customCategories.filter((c) => c.id !== id);
  rebuild();
}

/** Reactive list of all categories. */
export function useCategories(): ResolvedCategory[] {
  void initCategories();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
