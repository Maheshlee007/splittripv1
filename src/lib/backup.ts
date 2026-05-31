import { Group, Profile, PersonalExpense, PersonalBudget, CustomPaymentMethod, Lending } from "./types";
import {
  loadGroups, loadProfile, saveGroup, saveProfile,
  loadAllPersonalExpenses, savePersonalExpense,
  loadPersonalBudgets, savePersonalBudget,
  loadPaymentMethods, savePaymentMethod,
  loadLendings, saveLending,
} from "./storage";

export interface FullBackup {
  app: "splittrip";
  version: 1 | 2 | 3;
  exportedAt: number;
  profile: Profile | null;
  groups: Group[];
  personalExpenses?: PersonalExpense[];
  personalBudgets?: PersonalBudget[];
  paymentMethods?: CustomPaymentMethod[];
  lendings?: Lending[];
}

export async function buildBackup(): Promise<FullBackup> {
  const [profile, groups, personalExpenses, personalBudgets, paymentMethods, lendings] = await Promise.all([
    loadProfile(),
    loadGroups(),
    loadAllPersonalExpenses(),
    loadPersonalBudgets(),
    loadPaymentMethods(),
    loadLendings(),
  ]);
  return {
    app: "splittrip",
    version: 3,
    exportedAt: Date.now(),
    profile,
    groups,
    personalExpenses,
    personalBudgets,
    paymentMethods,
    lendings,
  };
}

export async function downloadBackup(): Promise<void> {
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `splittrip_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function restoreBackup(file: File): Promise<{
  groups: number;
  personalExpenses: number;
  personalBudgets: number;
  paymentMethods: number;
  lendings: number;
}> {
  const text = await file.text();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Not valid JSON"); }
  const { safeParseBackup } = await import("./schema");
  const parsed = safeParseBackup(raw);
  if (!parsed.success) {
    throw new Error("Not a SplitTrip backup file: " + (parsed.error.issues[0]?.message ?? "schema error"));
  }
  const data = parsed.data as unknown as FullBackup;
  if (data.profile) await saveProfile(data.profile);
  for (const g of data.groups) await saveGroup(g);
  let personalCount = 0;
  if (Array.isArray(data.personalExpenses)) {
    for (const e of data.personalExpenses) {
      await savePersonalExpense(e);
      personalCount++;
    }
  }
  let budgetCount = 0;
  if (Array.isArray(data.personalBudgets)) {
    for (const b of data.personalBudgets) {
      await savePersonalBudget(b);
      budgetCount++;
    }
  }
  let pmCount = 0;
  if (Array.isArray(data.paymentMethods)) {
    for (const pm of data.paymentMethods) {
      await savePaymentMethod(pm);
      pmCount++;
    }
  }
  let lendingCount = 0;
  if (Array.isArray(data.lendings)) {
    for (const l of data.lendings) {
      await saveLending(l);
      lendingCount++;
    }
  }
  return {
    groups: data.groups.length,
    personalExpenses: personalCount,
    personalBudgets: budgetCount,
    paymentMethods: pmCount,
    lendings: lendingCount,
  };
}
