import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Group, Profile, PersonalExpense, PersonalBudget } from "./types";

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
}

export type ThemePref = "light" | "dark" | "system";

let dbPromise: Promise<IDBPDatabase<SplitTripDB>> | null = null;
let idbAvailable = true;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<SplitTripDB>("splittrip", 2, {
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
  } catch { return []; }
}

export async function loadAllPersonalExpenses(): Promise<PersonalExpense[]> {
  try {
    return await (await db()).getAll("personal_expenses");
  } catch { return []; }
}

export async function savePersonalExpense(e: PersonalExpense): Promise<void> {
  try { await (await db()).put("personal_expenses", e); } catch {}
}

export async function deletePersonalExpense(id: string): Promise<void> {
  try { await (await db()).delete("personal_expenses", id); } catch {}
}

export async function loadPersonalBudgets(): Promise<PersonalBudget[]> {
  try { return await (await db()).getAll("personal_budgets"); } catch { return []; }
}

export async function savePersonalBudget(b: PersonalBudget): Promise<void> {
  try { await (await db()).put("personal_budgets", b); } catch {}
}
