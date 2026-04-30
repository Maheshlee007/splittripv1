import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";
import { Group } from "./types";

interface Slot {
  doc: Y.Doc;
  provider: WebrtcProvider;
  persistence: IndexeddbPersistence;
  onPeers?: (n: number) => void;
}

const slots = new Map<string, Slot>();
const remoteListeners = new Set<(g: Group) => void>();

const SIGNALING = [
  "wss://signaling.yjs.dev",
  "wss://y-webrtc-signaling-eu.herokuapp.com",
  "wss://y-webrtc-signaling-us.herokuapp.com",
];

export function connectGroup(id: string, opts: { onPeers?: (n: number) => void } = {}): void {
  if (slots.has(id)) {
    const s = slots.get(id)!;
    s.onPeers = opts.onPeers;
    return;
  }
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`splittrip-${id}`, doc);
  const provider = new WebrtcProvider(`splittrip-room-${id}`, doc, {
    signaling: SIGNALING,
  });
  const slot: Slot = { doc, provider, persistence, onPeers: opts.onPeers };
  slots.set(id, slot);

  const map = doc.getMap("group");
  map.observe(() => {
    const snap = map.get("snapshot") as Group | undefined;
    if (snap && snap.id === id) {
      for (const fn of remoteListeners) fn(snap);
    }
  });

  provider.on("peers", (e: { webrtcPeers: string[] }) => {
    slot.onPeers?.(e.webrtcPeers.length);
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
  // serialize-deserialize to drop undefineds & functions
  map.set("snapshot", JSON.parse(JSON.stringify(g)));
}

export function onRemoteGroup(fn: (g: Group) => void): () => void {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

export function peerCount(id: string): number {
  const s = slots.get(id);
  if (!s) return 0;
  return s.provider.room?.webrtcConns.size ?? 0;
}
