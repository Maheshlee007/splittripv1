/**
 * PeerJS-based mesh sync for SplitTrip.
 * - Each device picks a unique peer id `st-<groupId>-<rand>`.
 * - A deterministic beacon id `st-room-<groupId>` is claimed by the first device.
 *   Others connect to the beacon; the beacon shares the live peer list so
 *   everyone forms a mesh and receives the latest snapshot.
 * - If the beacon is taken (unavailable-id), we connect to it. If our own
 *   peer fails (broker disconnect, network drop), we reconnect with backoff.
 * - Multiple STUN fallbacks (Google 0..4) for NAT traversal.
 * - Snapshots are broadcast as plain JSON on every change (Yjs replaced).
 *
 * Public API kept identical to previous version.
 */
import Peer, { DataConnection } from "peerjs";
import { nanoid } from "nanoid";
import type { Group } from "./types";

export type SyncStatus = "connecting" | "signaling" | "connected" | "offline";

interface Slot {
  groupId: string;
  myId: string;
  peer: Peer;
  beaconHeld: boolean;          // we own the beacon id
  beaconConn?: DataConnection;  // we're connected to someone else's beacon
  conns: Map<string, DataConnection>;
  knownPeers: Set<string>;
  lastSnapshot?: Group;
  reconnectTimer?: number;
  reconnectAttempts: number;
  status: SyncStatus;
  destroyed: boolean;
  onPeers?: (n: number) => void;
  onStatus?: (s: SyncStatus) => void;
}

const slots = new Map<string, Slot>();
const remoteListeners = new Set<(g: Group) => void>();
const statusListeners = new Set<(id: string, s: SyncStatus) => void>();

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

function peerOpts() {
  return {
    config: { iceServers: ICE_SERVERS, iceTransportPolicy: "all" as RTCIceTransportPolicy },
    debug: 1,
  };
}

const beaconIdFor = (gid: string) => `st-room-${gid.toLowerCase()}`;
const memberPeerId = (gid: string) => `st-${gid.toLowerCase()}-${nanoid(8).toLowerCase()}`;

function setStatus(slot: Slot, s: SyncStatus) {
  slot.status = s;
  for (const fn of statusListeners) fn(slot.groupId, s);
  slot.onStatus?.(s);
}

function emitPeers(slot: Slot) {
  const n = slot.conns.size;
  slot.onPeers?.(n);
  if (n > 0) setStatus(slot, "connected");
  else if (slot.peer.disconnected || slot.peer.destroyed) setStatus(slot, "offline");
  else setStatus(slot, "signaling");
}

function wireConnection(slot: Slot, conn: DataConnection) {
  slot.conns.set(conn.peer, conn);
  slot.knownPeers.add(conn.peer);

  conn.on("open", () => {
    emitPeers(slot);
    // Send hello + our snapshot + known peers (so the other side can mesh)
    try {
      conn.send({ type: "hello", peers: [...slot.knownPeers], snapshot: slot.lastSnapshot });
    } catch {}
  });
  conn.on("data", (raw: any) => {
    if (!raw || typeof raw !== "object") return;
    if (raw.type === "snapshot" && raw.group) {
      handleSnapshot(slot, raw.group);
    } else if (raw.type === "hello") {
      if (raw.snapshot) handleSnapshot(slot, raw.snapshot);
      if (Array.isArray(raw.peers)) {
        for (const pid of raw.peers as string[]) {
          if (pid && pid !== slot.myId && !slot.conns.has(pid)) {
            connectToPeer(slot, pid);
          }
        }
      }
    } else if (raw.type === "peers" && Array.isArray(raw.list)) {
      for (const pid of raw.list as string[]) {
        if (pid && pid !== slot.myId && !slot.conns.has(pid)) {
          connectToPeer(slot, pid);
        }
      }
    }
  });
  const cleanup = () => {
    slot.conns.delete(conn.peer);
    emitPeers(slot);
  };
  conn.on("close", cleanup);
  conn.on("error", cleanup);
}

function connectToPeer(slot: Slot, peerId: string) {
  if (slot.destroyed || slot.conns.has(peerId) || peerId === slot.myId) return;
  try {
    const conn = slot.peer.connect(peerId, { reliable: true, serialization: "json" });
    if (conn) wireConnection(slot, conn);
  } catch {}
}

function handleSnapshot(slot: Slot, g: Group) {
  if (g.id !== slot.groupId) return;
  slot.lastSnapshot = g;
  for (const fn of remoteListeners) fn(g);
}

function tryClaimBeacon(slot: Slot) {
  if (slot.destroyed) return;
  const beaconId = beaconIdFor(slot.groupId);
  // We try claiming by creating a SECOND peer with the deterministic id.
  // If that id is taken, we connect to it instead.
  const claimer = new Peer(beaconId, peerOpts());
  claimer.on("open", () => {
    slot.beaconHeld = true;
    // beacon listens for incoming connections and forwards peer list
    claimer.on("connection", (conn) => {
      // Tell the new joiner about all current peers (including ourselves)
      conn.on("open", () => {
        const list = [slot.myId, ...slot.knownPeers].filter((x) => x !== conn.peer);
        try { conn.send({ type: "peers", list }); } catch {}
      });
      // Beacon also wires the conn so it joins the mesh too
      wireConnection(slot, conn);
    });
    // Beacon broadcasts our own peer id as well
    setStatus(slot, "signaling");
    // Advertise ourselves to any pre-existing peers (none if we're first)
  });
  claimer.on("error", (err: any) => {
    if (err?.type === "unavailable-id") {
      // beacon is taken — connect to it
      try {
        const conn = slot.peer.connect(beaconId, { reliable: true, serialization: "json" });
        if (conn) {
          slot.beaconConn = conn;
          wireConnection(slot, conn);
        }
      } catch {}
      claimer.destroy();
    } else if (err?.type === "peer-unavailable") {
      // ignore
    } else {
      // network/broker issue — retry shortly
      claimer.destroy();
      if (!slot.destroyed) {
        window.setTimeout(() => tryClaimBeacon(slot), 3000);
      }
    }
  });
  claimer.on("disconnected", () => {
    slot.beaconHeld = false;
    try { claimer.reconnect(); } catch {}
  });
  // Stash claimer on slot so we can destroy it
  (slot as any)._claimer = claimer;
}

function scheduleReconnect(slot: Slot) {
  if (slot.destroyed || slot.reconnectTimer) return;
  const delay = Math.min(30000, 1500 * Math.pow(2, slot.reconnectAttempts));
  slot.reconnectAttempts++;
  slot.reconnectTimer = window.setTimeout(() => {
    slot.reconnectTimer = undefined;
    if (slot.destroyed) return;
    try { slot.peer.reconnect(); } catch {}
    if (slot.peer.destroyed) {
      // recreate from scratch
      const opts = { groupId: slot.groupId, onPeers: slot.onPeers, onStatus: slot.onStatus };
      slots.delete(slot.groupId);
      connectGroup(opts.groupId, { onPeers: opts.onPeers, onStatus: opts.onStatus });
    }
  }, delay);
}

export function connectGroup(
  id: string,
  opts: { onPeers?: (n: number) => void; onStatus?: (s: SyncStatus) => void } = {}
): void {
  if (slots.has(id)) {
    const s = slots.get(id)!;
    s.onPeers = opts.onPeers;
    s.onStatus = opts.onStatus;
    // re-emit current state
    s.onPeers?.(s.conns.size);
    s.onStatus?.(s.status);
    return;
  }
  const myId = memberPeerId(id);
  const peer = new Peer(myId, peerOpts());
  const slot: Slot = {
    groupId: id,
    myId,
    peer,
    beaconHeld: false,
    conns: new Map(),
    knownPeers: new Set(),
    reconnectAttempts: 0,
    status: "connecting",
    destroyed: false,
    onPeers: opts.onPeers,
    onStatus: opts.onStatus,
  };
  slots.set(id, slot);
  setStatus(slot, "connecting");

  peer.on("open", () => {
    slot.reconnectAttempts = 0;
    setStatus(slot, "signaling");
    tryClaimBeacon(slot);
  });
  peer.on("connection", (conn) => wireConnection(slot, conn));
  peer.on("disconnected", () => {
    setStatus(slot, "offline");
    scheduleReconnect(slot);
  });
  peer.on("close", () => {
    setStatus(slot, "offline");
    if (!slot.destroyed) scheduleReconnect(slot);
  });
  peer.on("error", (err: any) => {
    // Most errors are non-fatal (peer-unavailable etc.). Network errors -> reconnect.
    if (err?.type === "network" || err?.type === "server-error" || err?.type === "socket-error" || err?.type === "socket-closed") {
      setStatus(slot, "offline");
      scheduleReconnect(slot);
    }
  });
}

export function disconnectGroup(id: string): void {
  const s = slots.get(id);
  if (!s) return;
  s.destroyed = true;
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
  for (const c of s.conns.values()) try { c.close(); } catch {}
  try { s.peer.destroy(); } catch {}
  try { (s as any)._claimer?.destroy(); } catch {}
  slots.delete(id);
}

export function broadcastGroup(g: Group): void {
  const s = slots.get(g.id);
  if (!s) return;
  s.lastSnapshot = g;
  const payload = { type: "snapshot", group: JSON.parse(JSON.stringify(g)) };
  for (const c of s.conns.values()) {
    try { if (c.open) c.send(payload); } catch {}
  }
}

export function onRemoteGroup(fn: (g: Group) => void): () => void {
  remoteListeners.add(fn);
  return () => { remoteListeners.delete(fn); };
}

export function onSyncStatus(fn: (id: string, s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

export function peerCount(id: string): number {
  return slots.get(id)?.conns.size ?? 0;
}

export function getMyPeerId(id: string): string | undefined {
  return slots.get(id)?.myId;
}

export function retryConnect(id: string): void {
  const s = slots.get(id);
  if (!s) return;
  s.reconnectAttempts = 0;
  if (s.peer.disconnected) try { s.peer.reconnect(); } catch {}
  if (!s.beaconHeld && !s.beaconConn) tryClaimBeacon(s);
}

/* --- Manual QR handshake helpers (offline fallback) ----------------------- */

/**
 * Create a manual offer connection for QR fallback. Returns the offer SDP
 * (compressed externally with lz-string by caller) and a function to apply
 * the remote answer.
 */
export async function createManualOffer(groupId: string): Promise<{
  sdp: string;
  applyAnswer: (answerSdp: string) => Promise<void>;
}> {
  const slot = slots.get(groupId);
  if (!slot) throw new Error("Group not connected");
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel("splittrip");
  channel.onopen = () => {
    // Wrap in a fake DataConnection-shaped object
    const fake: any = {
      peer: `manual-${nanoid(6)}`,
      open: true,
      send: (data: any) => channel.send(JSON.stringify(data)),
      close: () => pc.close(),
      on: () => {},
    };
    slot.conns.set(fake.peer, fake);
    emitPeers(slot);
    // hello
    try { fake.send({ type: "hello", peers: [...slot.knownPeers], snapshot: slot.lastSnapshot }); } catch {}
  };
  channel.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "snapshot" && data.group) handleSnapshot(slot, data.group);
    } catch {}
  };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && res();
    setTimeout(res, 4000);
  });
  return {
    sdp: JSON.stringify(pc.localDescription),
    applyAnswer: async (answerSdp: string) => {
      await pc.setRemoteDescription(JSON.parse(answerSdp));
    },
  };
}

export async function acceptManualOffer(groupId: string, offerSdp: string): Promise<string> {
  const slot = slots.get(groupId);
  if (!slot) throw new Error("Group not connected");
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.ondatachannel = (ev) => {
    const channel = ev.channel;
    channel.onopen = () => {
      const fake: any = {
        peer: `manual-${nanoid(6)}`,
        open: true,
        send: (data: any) => channel.send(JSON.stringify(data)),
        close: () => pc.close(),
        on: () => {},
      };
      slot.conns.set(fake.peer, fake);
      emitPeers(slot);
      try { fake.send({ type: "hello", peers: [...slot.knownPeers], snapshot: slot.lastSnapshot }); } catch {}
    };
    channel.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data);
        if (data?.type === "snapshot" && data.group) handleSnapshot(slot, data.group);
      } catch {}
    };
  };
  await pc.setRemoteDescription(JSON.parse(offerSdp));
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && res();
    setTimeout(res, 4000);
  });
  return JSON.stringify(pc.localDescription);
}
