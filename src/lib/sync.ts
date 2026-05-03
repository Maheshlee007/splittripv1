import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Group } from "./types";

interface Slot {
  doc: Y.Doc;
  provider: WebrtcProvider;
  persistence: IndexeddbPersistence;
  onPeers?: (n: number) => void;
  onStatus?: (s: SyncStatus) => void;
}

export type SyncStatus = "connecting" | "signaling" | "connected" | "offline";

const slots = new Map<string, Slot>();
const remoteListeners = new Set<(g: Group) => void>();
const statusListeners = new Set<(id: string, s: SyncStatus) => void>();

/** Public signaling — keep only the maintained one; add user override via localStorage. */
function getSignaling(): string[] {
  const custom = typeof localStorage !== "undefined" ? localStorage.getItem("splittrip:signaling") : null;
  if (custom) {
    return custom.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return ["wss://signaling.yjs.dev", "wss://y-webrtc-eu.fly.dev"];
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

function emitStatus(id: string, s: SyncStatus) {
  for (const fn of statusListeners) fn(id, s);
  slots.get(id)?.onStatus?.(s);
}

export function connectGroup(id: string, opts: { onPeers?: (n: number) => void; onStatus?: (s: SyncStatus) => void } = {}): void {
  if (slots.has(id)) {
    const s = slots.get(id)!;
    s.onPeers = opts.onPeers;
    s.onStatus = opts.onStatus;
    return;
  }
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`splittrip-${id}`, doc);
  const provider = new WebrtcProvider(`splittrip-room-${id}`, doc, {
    signaling: getSignaling(),
    peerOpts: { config: { iceServers: ICE_SERVERS } },
  } as any);
  const slot: Slot = { doc, provider, persistence, onPeers: opts.onPeers, onStatus: opts.onStatus };
  slots.set(id, slot);

  const map = doc.getMap("group");
  map.observe(() => {
    const snap = map.get("snapshot") as Group | undefined;
    if (snap && snap.id === id) {
      for (const fn of remoteListeners) fn(snap);
    }
  });

  emitStatus(id, "connecting");

  provider.on("peers", (e: { webrtcPeers: string[] }) => {
    const n = e.webrtcPeers.length;
    slot.onPeers?.(n);
    emitStatus(id, n > 0 ? "connected" : "signaling");
  });
  // y-webrtc fires 'status' for the signaling connection
  (provider as any).on?.("status", (ev: { connected: boolean }) => {
    if (!ev?.connected) emitStatus(id, "offline");
    else if ((provider.room?.webrtcConns.size ?? 0) === 0) emitStatus(id, "signaling");
  });
}

export function disconnectGroup(id: string): void {
  const s = slots.get(id);
  if (!s) return;
  s.provider.destroy();
  s.doc.destroy();
  slots.delete(id);
}

export function broadcastGroup(g: Group): void {
  const s = slots.get(g.id);
  if (!s) return;
  const map = s.doc.getMap("group");
  map.set("snapshot", JSON.parse(JSON.stringify(g)));
}

export function onRemoteGroup(fn: (g: Group) => void): () => void {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

export function onSyncStatus(fn: (id: string, s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function peerCount(id: string): number {
  const s = slots.get(id);
  if (!s) return 0;
  return s.provider.room?.webrtcConns.size ?? 0;
}

export function setSignalingServers(urls: string[]): void {
  if (typeof localStorage === "undefined") return;
  if (!urls.length) localStorage.removeItem("splittrip:signaling");
  else localStorage.setItem("splittrip:signaling", urls.join(","));
}

export function getSignalingServers(): string[] {
  return getSignaling();
}
