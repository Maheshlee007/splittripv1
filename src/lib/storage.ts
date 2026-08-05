import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Group, Profile, PersonalExpense, PersonalBudget, CustomPaymentMethod, CustomCategory, Lending } from "./types";

interface SplitTripDB extends DBSchema {
  groups: { key: string; value: Group };
  meta: { key: string; value: unknown };
  personal_expenses: {
    key: string;
    value: PersonalExpense;
    indexes: {
      "by_month": string;
      "by_category": string;
      "by_month_category": [string, string];
    };
  };
  personal_budgets: {
    key: string;
    value: PersonalBudget;
    indexes: { "by_month": string };
  };
  personal_payment_methods: {
    key: string;
    value: CustomPaymentMethod;
  };
  /** User-added categories only — built-ins live in lib/categories.ts. */
  personal_categories: {
    key: string;
    value: CustomCategory;
  };
  lendings: {
    key: string;
    value: Lending;
    indexes: {
      "by_status": string;
      "by_person": string;
    };
  };
}

export type ThemePref = "light" | "dark" | "system";

let dbPromise: Promise<IDBPDatabase<SplitTripDB>> | null = null;
let idbAvailable = true;

const DEFAULT_PAYMENT_METHODS: CustomPaymentMethod[] = [
  { id: "upi", label: "UPI", icon: "smartphone", isDefault: true },
  { id: "credit", label: "Credit Card", icon: "credit-card", isDefault: true },
  { id: "debit", label: "Debit Card", icon: "wallet", isDefault: true },
  { id: "cash", label: "Cash", icon: "banknote", isDefault: true },
  { id: "wallet", label: "Wallet", icon: "wallet-cards", isDefault: true },
];

function db() {
  if (!dbPromise) {
    dbPromise = openDB<SplitTripDB>("splittrip", 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("groups", { keyPath: "id" });
          db.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          const peStore = db.createObjectStore("personal_expenses", { keyPath: "id" });
          peStore.createIndex("by_month", "monthKey");
          peStore.createIndex("by_category", "category");
          peStore.createIndex("by_month_category", ["monthKey", "category"]);

          const pbStore = db.createObjectStore("personal_budgets", { keyPath: "monthKey" });
          pbStore.createIndex("by_month", "monthKey");
        }
        if (oldVersion < 3) {
          const pmStore = db.createObjectStore("personal_payment_methods", { keyPath: "id" });
          for (const pm of DEFAULT_PAYMENT_METHODS) pmStore.add(pm);

          const lStore = db.createObjectStore("lendings", { keyPath: "id" });
          lStore.createIndex("by_status", "status");
          lStore.createIndex("by_person", "personName");
        }
        if (oldVersion < 4) {
          db.createObjectStore("personal_categories", { keyPath: "id" });
        }
      },
      blocked() {
        console.warn("[SplitTrip] DB upgrade blocked — close other tabs");
      },
    }).catch((err) => {
      idbAvailable = false;
      throw err;
    }) as Promise<IDBPDatabase<SplitTripDB>>;
  }
  return dbPromise;
}

/* ---------- localStorage fallback layer ---------- */
const LS_GROUPS = "splittrip:groups";
const LS_PROFILE = "splittrip:profile";
const LS_THEME = "splittrip:theme";
const LS_PERSONAL_EXPENSES = "splittrip:personal_expenses";
const LS_PERSONAL_BUDGETS = "splittrip:personal_budgets";
const LS_PAYMENT_METHODS = "splittrip:payment_methods";
const LS_CATEGORIES = "splittrip:categories";
const LS_LENDINGS = "splittrip:lendings";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function lsSet<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}
function lsUpsertById<T extends { id: string }>(key: string, item: T) {
  const arr = lsGet<T[]>(key, []);
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) arr.push(item); else arr[i] = item;
  lsSet(key, arr);
}
function lsRemoveById<T extends { id: string }>(key: string, id: string) {
  const arr = lsGet<T[]>(key, []);
  lsSet(key, arr.filter((x) => x.id !== id));
}

function lsGetGroups(): Group[] {
  try { return JSON.parse(localStorage.getItem(LS_GROUPS) || "[]"); } catch { return []; }
}
function lsSetGroups(gs: Group[]) {
  try { localStorage.setItem(LS_GROUPS, JSON.stringify(gs)); } catch {}
}

export async function loadGroups(): Promise<Group[]> {
  try {
    const v = await (await db()).getAll("groups");
    if (v.length === 0) {
      // hydrate from LS if idb empty (recovery)
      const ls = lsGetGroups();
      for (const g of ls) await (await db()).put("groups", g);
      return ls.length ? ls : v;
    }
    return v;
  } catch {
    return lsGetGroups();
  }
}
export async function saveGroup(g: Group): Promise<void> {
  try { await (await db()).put("groups", g); } catch {}
  // mirror to LS as fallback
  const ls = lsGetGroups();
  const i = ls.findIndex((x) => x.id === g.id);
  if (i === -1) ls.push(g); else ls[i] = g;
  lsSetGroups(ls);
}
export async function deleteGroup(id: string): Promise<void> {
  try { await (await db()).delete("groups", id); } catch {}
  lsSetGroups(lsGetGroups().filter((g) => g.id !== id));
}
export async function loadProfile(): Promise<Profile | null> {
  try {
    const v = (await (await db()).get("meta", "profile")) as Profile | undefined;
    if (v) return v;
  } catch {}
  try { return JSON.parse(localStorage.getItem(LS_PROFILE) || "null"); } catch { return null; }
}
export async function saveProfile(p: Profile): Promise<void> {
  try { await (await db()).put("meta", p, "profile"); } catch {}
  try { localStorage.setItem(LS_PROFILE, JSON.stringify(p)); } catch {}
}
export async function loadTheme(): Promise<ThemePref> {
  try {
    const v = (await (await db()).get("meta", "theme")) as ThemePref | undefined;
    if (v) return v;
  } catch {}
  return ((typeof localStorage !== "undefined" && (localStorage.getItem(LS_THEME) as ThemePref)) || "system");
}
export async function saveTheme(t: ThemePref): Promise<void> {
  try { await (await db()).put("meta", t, "theme"); } catch {}
  try { localStorage.setItem(LS_THEME, t); } catch {}
}

export function isIdbAvailable() { return idbAvailable; }

/* ---------- Personal Expenses ---------- */

export async function loadPersonalExpensesByMonth(monthKey: string): Promise<PersonalExpense[]> {
  try {
    return await (await db()).getAllFromIndex("personal_expenses", "by_month", monthKey);
  } catch {
    return lsGet<PersonalExpense[]>(LS_PERSONAL_EXPENSES, []).filter((e) => e.monthKey === monthKey);
  }
}

export async function loadAllPersonalExpenses(): Promise<PersonalExpense[]> {
  try {
    const v = await (await db()).getAll("personal_expenses");
    if (v.length === 0) {
      // hydrate IDB from LS if IDB was wiped (recovery)
      const ls = lsGet<PersonalExpense[]>(LS_PERSONAL_EXPENSES, []);
      for (const e of ls) await (await db()).put("personal_expenses", e);
      return ls;
    }
    return v;
  } catch {
    return lsGet<PersonalExpense[]>(LS_PERSONAL_EXPENSES, []);
  }
}

export async function savePersonalExpense(e: PersonalExpense): Promise<void> {
  try { await (await db()).put("personal_expenses", e); } catch { /* noop */ }
  lsUpsertById(LS_PERSONAL_EXPENSES, e);
}

export async function deletePersonalExpense(id: string): Promise<void> {
  try { await (await db()).delete("personal_expenses", id); } catch { /* noop */ }
  lsRemoveById<PersonalExpense>(LS_PERSONAL_EXPENSES, id);
}

export async function loadPersonalBudgets(): Promise<PersonalBudget[]> {
  try {
    const v = await (await db()).getAll("personal_budgets");
    if (v.length === 0) {
      const ls = lsGet<PersonalBudget[]>(LS_PERSONAL_BUDGETS, []);
      for (const b of ls) await (await db()).put("personal_budgets", b);
      return ls;
    }
    return v;
  } catch {
    return lsGet<PersonalBudget[]>(LS_PERSONAL_BUDGETS, []);
  }
}

export async function savePersonalBudget(b: PersonalBudget): Promise<void> {
  try { await (await db()).put("personal_budgets", b); } catch { /* noop */ }
  // budgets keyed by monthKey (not id)
  const arr = lsGet<PersonalBudget[]>(LS_PERSONAL_BUDGETS, []);
  const i = arr.findIndex((x) => x.monthKey === b.monthKey);
  if (i === -1) arr.push(b); else arr[i] = b;
  lsSet(LS_PERSONAL_BUDGETS, arr);
}

/* ---------- Payment Methods ---------- */

export async function loadPaymentMethods(): Promise<CustomPaymentMethod[]> {
  try {
    const items = await (await db()).getAll("personal_payment_methods");
    if (items.length > 0) return items;
    const ls = lsGet<CustomPaymentMethod[]>(LS_PAYMENT_METHODS, []);
    if (ls.length > 0) {
      for (const pm of ls) await (await db()).put("personal_payment_methods", pm);
      return ls;
    }
    return DEFAULT_PAYMENT_METHODS;
  } catch {
    const ls = lsGet<CustomPaymentMethod[]>(LS_PAYMENT_METHODS, []);
    return ls.length > 0 ? ls : DEFAULT_PAYMENT_METHODS;
  }
}

export async function savePaymentMethod(pm: CustomPaymentMethod): Promise<void> {
  try { await (await db()).put("personal_payment_methods", pm); } catch { /* noop */ }
  lsUpsertById(LS_PAYMENT_METHODS, pm);
}

export async function deletePaymentMethod(id: string): Promise<void> {
  try { await (await db()).delete("personal_payment_methods", id); } catch { /* noop */ }
  lsRemoveById<CustomPaymentMethod>(LS_PAYMENT_METHODS, id);
}

/* ---------- Categories (user-added only) ---------- */

export async function loadCategories(): Promise<CustomCategory[]> {
  try {
    const items = await (await db()).getAll("personal_categories");
    if (items.length > 0) return items;
    const ls = lsGet<CustomCategory[]>(LS_CATEGORIES, []);
    for (const c of ls) await (await db()).put("personal_categories", c);
    return ls;
  } catch {
    return lsGet<CustomCategory[]>(LS_CATEGORIES, []);
  }
}

export async function saveCategory(c: CustomCategory): Promise<void> {
  try { await (await db()).put("personal_categories", c); } catch { /* noop */ }
  lsUpsertById(LS_CATEGORIES, c);
}

export async function deleteCategory(id: string): Promise<void> {
  try { await (await db()).delete("personal_categories", id); } catch { /* noop */ }
  lsRemoveById<CustomCategory>(LS_CATEGORIES, id);
}

/* ---------- Lendings ---------- */

export async function loadLendings(): Promise<Lending[]> {
  try {
    const v = await (await db()).getAll("lendings");
    if (v.length === 0) {
      const ls = lsGet<Lending[]>(LS_LENDINGS, []);
      for (const l of ls) await (await db()).put("lendings", l);
      return ls;
    }
    return v;
  } catch {
    return lsGet<Lending[]>(LS_LENDINGS, []);
  }
}

export async function saveLending(l: Lending): Promise<void> {
  try { await (await db()).put("lendings", l); } catch { /* noop */ }
  lsUpsertById(LS_LENDINGS, l);
}

export async function deleteLending(id: string): Promise<void> {
  try { await (await db()).delete("lendings", id); } catch { /* noop */ }
  lsRemoveById<Lending>(LS_LENDINGS, id);
}
