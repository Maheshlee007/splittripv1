import { openDB, DBSchema, IDBPDatabase } from "idb";
import { Group, Profile } from "./types";

interface SplitTripDB extends DBSchema {
  groups: { key: string; value: Group };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<SplitTripDB>> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB<SplitTripDB>("splittrip", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("groups")) db.createObjectStore("groups", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

export async function loadGroups(): Promise<Group[]> {
  return (await db()).getAll("groups");
}
export async function saveGroup(g: Group): Promise<void> {
  await (await db()).put("groups", g);
}
export async function deleteGroup(id: string): Promise<void> {
  await (await db()).delete("groups", id);
}
export async function loadProfile(): Promise<Profile | null> {
  return ((await (await db()).get("meta", "profile")) as Profile | undefined) ?? null;
}
export async function saveProfile(p: Profile): Promise<void> {
  await (await db()).put("meta", p, "profile");
}
export async function loadTheme(): Promise<"light" | "dark"> {
  return ((await (await db()).get("meta", "theme")) as "light" | "dark" | undefined) ?? "light";
}
export async function saveTheme(t: "light" | "dark"): Promise<void> {
  await (await db()).put("meta", t, "theme");
}
