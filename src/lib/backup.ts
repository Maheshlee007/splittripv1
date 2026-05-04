import { Group, Profile } from "./types";
import { loadGroups, loadProfile, saveGroup, saveProfile } from "./storage";

export interface FullBackup {
  app: "splittrip";
  version: 1;
  exportedAt: number;
  profile: Profile | null;
  groups: Group[];
}

export async function buildBackup(): Promise<FullBackup> {
  const [profile, groups] = await Promise.all([loadProfile(), loadGroups()]);
  return { app: "splittrip", version: 1, exportedAt: Date.now(), profile, groups };
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
  const data = JSON.parse(text) as FullBackup;
  if (!data || data.app !== "splittrip" || !Array.isArray(data.groups)) {
    throw new Error("Not a SplitTrip backup file");
  }
  if (data.profile) await saveProfile(data.profile);
  for (const g of data.groups) await saveGroup(g);
  return { groups: data.groups.length };
}
