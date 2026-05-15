import { Group, Profile, PersonalExpense } from "./types";
import { loadGroups, loadProfile, saveGroup, saveProfile, loadAllPersonalExpenses, savePersonalExpense } from "./storage";

export interface FullBackup {
  app: "splittrip";
  version: 1 | 2;
  exportedAt: number;
  profile: Profile | null;
  groups: Group[];
  personalExpenses?: PersonalExpense[];
}

export async function buildBackup(): Promise<FullBackup> {
  const [profile, groups, personalExpenses] = await Promise.all([loadProfile(), loadGroups(), loadAllPersonalExpenses()]);
  return { app: "splittrip", version: 2, exportedAt: Date.now(), profile, groups, personalExpenses };
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

export async function restoreBackup(file: File): Promise<{ groups: number }> {
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
  if (data.personalExpenses) {
    for (const e of data.personalExpenses) await savePersonalExpense(e);
  }
  return { groups: data.groups.length };
}
