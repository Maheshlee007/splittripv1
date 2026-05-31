/**
 * Request persistent storage from the browser so IndexedDB / localStorage
 * data won't be auto-evicted (Chrome typically clears non-persisted
 * site data after ~6-7 days of inactivity, even for PWAs).
 *
 * Safe to call multiple times. Returns true if storage is persistent.
 */
let cached: boolean | null = null;

export async function ensurePersistentStorage(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    if (typeof navigator === "undefined" || !navigator.storage) {
      cached = false;
      return false;
    }
    // Already persisted?
    if (typeof navigator.storage.persisted === "function") {
      const already = await navigator.storage.persisted();
      if (already) {
        cached = true;
        return true;
      }
    }
    if (typeof navigator.storage.persist === "function") {
      // In Chrome, persist() is granted automatically for installed PWAs
      // or sites with high engagement; otherwise it may be rejected silently.
      const granted = await navigator.storage.persist();
      cached = granted;
      // eslint-disable-next-line no-console
      console.info(
        granted
          ? "[SplitTrip] Persistent storage granted — data will not be auto-evicted."
          : "[SplitTrip] Persistent storage NOT granted. Install the PWA / bookmark the site to make data permanent."
      );
      return granted;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[SplitTrip] persistent storage request failed:", e);
  }
  cached = false;
  return false;
}

export async function getStorageEstimate(): Promise<{ usage?: number; quota?: number; persisted: boolean }> {
  const persisted =
    typeof navigator !== "undefined" && navigator.storage?.persisted
      ? await navigator.storage.persisted().catch(() => false)
      : false;
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage, quota: e.quota, persisted };
    }
  } catch { /* noop */ }
  return { persisted };
}
