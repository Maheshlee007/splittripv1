/**
 * SplitTrip sync — native WebRTC mesh, MQTT signaling (HiveMQ public broker),
 * AES-encrypted payloads (the trip code is the shared secret), and an offline
 * QR-handshake fallback (compressed SDPs via lz-string, done by callers).
 *
 * Public API kept identical so AppStore + components don't change.
 */
import mqtt, { type MqttClient } from "mqtt";
import CryptoJS from "crypto-js";
import { nanoid } from "nanoid";
import type { Group } from "./types";

export type SyncStatus = "connecting" | "signaling" | "connected" | "offline";

const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

type SignalKind = "hello" | "bye" | "offer" | "answer" | "ice";
interface Envelope {
  kind: SignalKind;
  from: string;
  to?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

interface PeerLink {
  peerId: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  open: boolean;
  pendingIce: RTCIceCandidateInit[];
}

interface Slot {
  groupId: string;
  topic: string;
  secret: string;
  myId: string;
  client: MqttClient | null;
  links: Map<string, PeerLink>;
  lastSnapshot?: Group;
  status: SyncStatus;
  destroyed: boolean;
  helloTimer?: number;
  reconnectTimer?: number;
  reconnectAttempts: number;
  onPeers?: (n: number) => void;
  onStatus?: (s: SyncStatus) => void;
}

const slots = new Map<string, Slot>();
const remoteListeners = new Set<(g: Group) => void>();
const statusListeners = new Set<(id: string, s: SyncStatus) => void>();

const topicFor = (gid: string) => `splittrip/${gid.toUpperCase()}/signal`;
const myPeerId = () => `p-${nanoid(10)}`;

function encrypt(secret: string, payload: any): string {
  return CryptoJS.AES.encrypt(JSON.stringify(payload), secret).toString();
}
function decrypt(secret: string, ciphertext: string): any | null {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    return JSON.parse(text);
  } catch { return null; }
}

function setStatus(slot: Slot, s: SyncStatus) {
  if (slot.status === s) return;
  slot.status = s;
  for (const fn of statusListeners) fn(slot.groupId, s);
  slot.onStatus?.(s);
}

function emitPeers(slot: Slot) {
  const n = [...slot.links.values()].filter((l) => l.open).length;
  slot.onPeers?.(n);
  if (n > 0) setStatus(slot, "connected");
  else if (slot.client?.connected) setStatus(slot, "signaling");
  else setStatus(slot, "offline");
}

function publish(slot: Slot, env: Envelope) {
  if (!slot.client?.connected) return;
  try { slot.client.publish(slot.topic, encrypt(slot.secret, env), { qos: 0 }); } catch {}
}

function handleSnapshot(slot: Slot, g: Group) {
  if (!g || g.id !== slot.groupId) return;
  slot.lastSnapshot = g;
  for (const fn of remoteListeners) fn(g);
}

function wireDataChannel(slot: Slot, link: PeerLink, dc: RTCDataChannel) {
  link.dc = dc;
  dc.onopen = () => {
    link.open = true;
    emitPeers(slot);
    try { dc.send(JSON.stringify({ type: "hello", snapshot: slot.lastSnapshot })); } catch {}
  };
  dc.onclose = () => { link.open = false; emitPeers(slot); };
  dc.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "snapshot" && data.group) handleSnapshot(slot, data.group);
      else if (data?.type === "hello" && data.snapshot) handleSnapshot(slot, data.snapshot);
    } catch {}
  };
}

function createPeerLink(slot: Slot, peerId: string): PeerLink {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const link: PeerLink = { peerId, pc, open: false, pendingIce: [] };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) publish(slot, { kind: "ice", from: slot.myId, to: peerId, candidate: ev.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "failed" || st === "closed" || st === "disconnected") {
      link.open = false;
      slot.links.delete(peerId);
      emitPeers(slot);
    }
  };
  pc.ondatachannel = (ev) => wireDataChannel(slot, link, ev.channel);
  slot.links.set(peerId, link);
  return link;
}

async function initiateOffer(slot: Slot, peerId: string) {
  if (slot.links.has(peerId)) return;
  const link = createPeerLink(slot, peerId);
  const dc = link.pc.createDataChannel("expense-sync");
  wireDataChannel(slot, link, dc);
  const offer = await link.pc.createOffer();
  await link.pc.setLocalDescription(offer);
  publish(slot, { kind: "offer", from: slot.myId, to: peerId, sdp: JSON.stringify(link.pc.localDescription) });
}

async function handleOffer(slot: Slot, fromId: string, sdp: string) {
  let link = slot.links.get(fromId);
  if (!link) link = createPeerLink(slot, fromId);
  await link.pc.setRemoteDescription(JSON.parse(sdp));
  for (const c of link.pendingIce) { try { await link.pc.addIceCandidate(c); } catch {} }
  link.pendingIce = [];
  const answer = await link.pc.createAnswer();
  await link.pc.setLocalDescription(answer);
  publish(slot, { kind: "answer", from: slot.myId, to: fromId, sdp: JSON.stringify(link.pc.localDescription) });
}

async function handleAnswer(slot: Slot, fromId: string, sdp: string) {
  const link = slot.links.get(fromId);
  if (!link) return;
  try { await link.pc.setRemoteDescription(JSON.parse(sdp)); } catch {}
  for (const c of link.pendingIce) { try { await link.pc.addIceCandidate(c); } catch {} }
  link.pendingIce = [];
}

async function handleIce(slot: Slot, fromId: string, candidate: RTCIceCandidateInit) {
  const link = slot.links.get(fromId);
  if (!link) return;
  if (!link.pc.remoteDescription) { link.pendingIce.push(candidate); return; }
  try { await link.pc.addIceCandidate(candidate); } catch {}
}

function startMqtt(slot: Slot) {
  if (slot.client) return;
  let client: MqttClient;
  try {
    client = mqtt.connect(BROKER_URL, {
      clean: true,
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      keepalive: 30,
      clientId: `st-${slot.myId}`,
    });
  } catch {
    setStatus(slot, "offline");
    return;
  }
  slot.client = client;
  setStatus(slot, "connecting");

  client.on("connect", () => {
    if (slot.destroyed) return;
    setStatus(slot, "signaling");
    client.subscribe(slot.topic, { qos: 0 }, () => {
      // Announce presence; existing peers (with smaller id) will initiate offers to us.
      publish(slot, { kind: "hello", from: slot.myId });
      // Re-hello periodically so late joiners discover us
      if (slot.helloTimer) window.clearInterval(slot.helloTimer);
      slot.helloTimer = window.setInterval(() => publish(slot, { kind: "hello", from: slot.myId }), 25000);
    });
    emitPeers(slot);
  });
  client.on("reconnect", () => setStatus(slot, "connecting"));
  client.on("close", () => emitPeers(slot));
  client.on("offline", () => setStatus(slot, "offline"));
  client.on("error", () => setStatus(slot, "offline"));
  client.on("message", async (_t, msg) => {
    const env = decrypt(slot.secret, msg.toString()) as Envelope | null;
    if (!env || !env.from || env.from === slot.myId) return;
    if (env.to && env.to !== slot.myId) return;
    try {
      if (env.kind === "hello") {
        // Deterministic role: smaller id initiates offer
        if (slot.myId < env.from && !slot.links.has(env.from)) {
          await initiateOffer(slot, env.from);
        } else if (!slot.links.has(env.from)) {
          // wait for their offer; reply with hello so they see us
          publish(slot, { kind: "hello", from: slot.myId });
        }
      } else if (env.kind === "offer" && env.sdp) {
        await handleOffer(slot, env.from, env.sdp);
      } else if (env.kind === "answer" && env.sdp) {
        await handleAnswer(slot, env.from, env.sdp);
      } else if (env.kind === "ice" && env.candidate) {
        await handleIce(slot, env.from, env.candidate);
      } else if (env.kind === "bye") {
        const link = slot.links.get(env.from);
        if (link) { try { link.pc.close(); } catch {}; slot.links.delete(env.from); emitPeers(slot); }
      }
    } catch {}
  });
}

export function connectGroup(
  id: string,
  opts: { onPeers?: (n: number) => void; onStatus?: (s: SyncStatus) => void } = {}
): void {
  if (slots.has(id)) {
    const s = slots.get(id)!;
    s.onPeers = opts.onPeers;
    s.onStatus = opts.onStatus;
    s.onPeers?.([...s.links.values()].filter((l) => l.open).length);
    s.onStatus?.(s.status);
    return;
  }
  const myId = myPeerId();
  const slot: Slot = {
    groupId: id,
    topic: topicFor(id),
    secret: id.toUpperCase(),
    myId,
    client: null,
    links: new Map(),
    status: "connecting",
    destroyed: false,
    reconnectAttempts: 0,
    onPeers: opts.onPeers,
    onStatus: opts.onStatus,
  };
  slots.set(id, slot);
  startMqtt(slot);
}

export function disconnectGroup(id: string): void {
  const s = slots.get(id);
  if (!s) return;
  s.destroyed = true;
  if (s.helloTimer) window.clearInterval(s.helloTimer);
  if (s.reconnectTimer) window.clearTimeout(s.reconnectTimer);
  publish(s, { kind: "bye", from: s.myId });
  for (const link of s.links.values()) { try { link.dc?.close(); link.pc.close(); } catch {} }
  s.links.clear();
  try { s.client?.end(true); } catch {}
  s.client = null;
  slots.delete(id);
}

export function broadcastGroup(g: Group): void {
  const s = slots.get(g.id);
  if (!s) return;
  s.lastSnapshot = g;
  const payload = JSON.stringify({ type: "snapshot", group: JSON.parse(JSON.stringify(g)) });
  for (const link of s.links.values()) {
    if (link.open && link.dc) try { link.dc.send(payload); } catch {}
  }
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
  return s ? [...s.links.values()].filter((l) => l.open).length : 0;
}
export function getMyPeerId(id: string): string | undefined {
  return slots.get(id)?.myId;
}
export function retryConnect(id: string): void {
  const s = slots.get(id);
  if (!s) return;
  if (s.client) { try { s.client.reconnect(); } catch {} }
  else startMqtt(s);
}

/* ------------- Manual QR handshake fallback (offline) ------------- */

export async function createManualOffer(groupId: string): Promise<{
  sdp: string;
  applyAnswer: (answerSdp: string) => Promise<void>;
}> {
  let slot = slots.get(groupId);
  if (!slot) { connectGroup(groupId); slot = slots.get(groupId)!; }
  const peerId = `manual-${nanoid(6)}`;
  const link = createPeerLink(slot, peerId);
  const dc = link.pc.createDataChannel("expense-sync");
  wireDataChannel(slot, link, dc);
  await link.pc.setLocalDescription(await link.pc.createOffer());
  await new Promise<void>((res) => {
    if (link.pc.iceGatheringState === "complete") return res();
    link.pc.onicegatheringstatechange = () => link.pc.iceGatheringState === "complete" && res();
    setTimeout(res, 4000);
  });
  return {
    sdp: JSON.stringify(link.pc.localDescription),
    applyAnswer: async (answerSdp: string) => {
      await link.pc.setRemoteDescription(JSON.parse(answerSdp));
    },
  };
}

export async function acceptManualOffer(groupId: string, offerSdp: string): Promise<string> {
  let slot = slots.get(groupId);
  if (!slot) { connectGroup(groupId); slot = slots.get(groupId)!; }
  const peerId = `manual-${nanoid(6)}`;
  const link = createPeerLink(slot, peerId);
  await link.pc.setRemoteDescription(JSON.parse(offerSdp));
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  await new Promise<void>((res) => {
    if (link.pc.iceGatheringState === "complete") return res();
    link.pc.onicegatheringstatechange = () => link.pc.iceGatheringState === "complete" && res();
    setTimeout(res, 4000);
  });
  return JSON.stringify(link.pc.localDescription);
}
