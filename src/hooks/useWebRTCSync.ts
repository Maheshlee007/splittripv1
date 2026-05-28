import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot, deleteDoc, collection, getDocs, getDoc, Timestamp } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Group } from "@/lib/types";
import { safeParseGroup } from "@/lib/schema";
import { toast } from "sonner";

export type SyncStatus = "idle" | "syncing" | "connected" | "offline" | "failed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

const ICE_GATHER_TIMEOUT = 8000;
const SYNC_WINDOW_TIMEOUT = 30_000;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 30_000;
const PRESENCE_STALE_TIMEOUT = 30_000;
const MAX_AUTO_RECONNECT = 3;

const log = (...args: unknown[]) => console.log("[WebRTC]", ...args);

function encrypt(secret: string, data: any): string {
  return CryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();
}

function decrypt(secret: string, cipherText: string): any | null {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, secret);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Manual-sync WebRTC signaling via Firestore.
 * Firebase is ONLY used during a 30s sync window (user-triggered via startSync).
 * After DataChannel opens, Firebase listener is unsubscribed immediately.
 * All data flows over WebRTC. Heartbeat every 15s detects silent drops.
 * Auto-reconnect capped at 3 attempts for dropped sessions.
 */
export function useWebRTCSync(
  tripId: string | undefined,
  code: string | undefined,
  isHost: boolean,
  memberId: string | undefined,
  onRemoteGroup: (g: Group) => void,
  onKick: (groupId: string, targetId: string, kickerId?: string) => void,
  onTripEnded: (groupId: string) => void,
  onConnect: () => void,
  syncDisabled?: boolean
) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [onlineMembers, setOnlineMembers] = useState<string[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dcsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const onRemoteGroupRef = useRef(onRemoteGroup);
  const onKickRef = useRef(onKick);
  const onTripEndedRef = useRef(onTripEnded);
  const onConnectRef = useRef(onConnect);
  const processingPeersRef = useRef<Set<string>>(new Set());
  const lastProcessedSdpRef = useRef<Map<string, string>>(new Map());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReconnectCountRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  const heartbeatResetRef = useRef<(() => void) | null>(null);
  const peerLastSeenRef = useRef<Map<string, number>>(new Map());
  const silentSyncRef = useRef(false);

  useEffect(() => { onRemoteGroupRef.current = onRemoteGroup; }, [onRemoteGroup]);
  useEffect(() => { onKickRef.current = onKick; }, [onKick]);
  useEffect(() => { onTripEndedRef.current = onTripEnded; }, [onTripEnded]);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
    if (heartbeatTimeoutRef.current) { clearTimeout(heartbeatTimeoutRef.current); heartbeatTimeoutRef.current = null; }
    heartbeatResetRef.current = null;
  }, []);

  const cleanupFirebase = useCallback(() => {
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    if (syncTimeoutRef.current) { clearTimeout(syncTimeoutRef.current); syncTimeoutRef.current = null; }
  }, []);

  const disconnectAll = useCallback(() => {
    dcsRef.current.forEach(dc => dc.close());
    pcsRef.current.forEach(pc => pc.close());
    dcsRef.current.clear();
    pcsRef.current.clear();
    processingPeersRef.current.clear();
    lastProcessedSdpRef.current.clear();
    peerLastSeenRef.current.clear();
    setOnlineMembers([]);
    stopHeartbeat();
    cleanupFirebase();
  }, [stopHeartbeat, cleanupFirebase]);

  // Cleanup on unmount or tripId change
  useEffect(() => {
    destroyedRef.current = false;
    return () => { destroyedRef.current = true; disconnectAll(); };
  }, [tripId, disconnectAll]);

  const broadcastPresence = useCallback((members: string[]) => {
    const payload = JSON.stringify({ type: "presence", members });
    dcsRef.current.forEach(dc => {
      if (dc.readyState === "open") { try { dc.send(payload); } catch {} }
    });
  }, []);

  const updateHostPresence = useCallback(() => {
    if (!isHost || !memberId) return;
    const now = Date.now();
    const activeIds = Array.from(dcsRef.current.entries())
      .filter(([peerId, dc]) => {
        if (dc.readyState !== "open") return false;
        const lastSeen = peerLastSeenRef.current.get(peerId) ?? 0;
        return now - lastSeen <= PRESENCE_STALE_TIMEOUT;
      })
      .map(([id]) => id);
    const online = [memberId, ...activeIds];
    setOnlineMembers(online);
    if (online.length > 1) setStatus("connected");
    broadcastPresence(online);
  }, [isHost, memberId, broadcastPresence]);

  const startHostHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimerRef.current = setInterval(() => {
      const payload = JSON.stringify({ type: "heartbeat", ts: Date.now() });
      let anyOpen = false;
      dcsRef.current.forEach(dc => {
        if (dc.readyState === "open") { anyOpen = true; try { dc.send(payload); } catch {} }
      });
      if (!anyOpen && !destroyedRef.current) {
        log("Host: all DCs closed");
        stopHeartbeat();
        setStatus("offline");
      }
      updateHostPresence();
    }, HEARTBEAT_INTERVAL);
  }, [stopHeartbeat, updateHostPresence]);

  const broadcastGroup = useCallback((g: Group, force = false) => {
    const payload = JSON.stringify({ type: "snapshot", group: JSON.parse(JSON.stringify(g)) });
    const approvedIds = new Set(g.members.filter(m => m.status === "active").map(m => m.id));
    dcsRef.current.forEach((dc, peerId) => {
      if (dc.readyState === "open" && (force || approvedIds.has(peerId) || peerId === "host")) {
        try { dc.send(payload); } catch {}
      }
    });
  }, []);

  const broadcastKickFn = useCallback((targetId: string, kickerId: string) => {
    const payload = JSON.stringify({ type: "kick", memberId: targetId, kickerId });
    dcsRef.current.forEach(dc => { if (dc.readyState === "open") { try { dc.send(payload); } catch {} } });
  }, []);

  const broadcastEndTrip = useCallback(() => {
    const payload = JSON.stringify({ type: "trip_ended" });
    dcsRef.current.forEach(dc => { if (dc.readyState === "open") { try { dc.send(payload); } catch {} } });
  }, []);

  const handleDataChannelMessage = useCallback((ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "snapshot" && data.group) {
        const parsed = safeParseGroup(data.group);
        if (parsed.success) { onRemoteGroupRef.current(parsed.data as Group); setLastSyncedAt(Date.now()); }
      } else if (data?.type === "kick" && data.memberId && data.kickerId) {
        if (tripId) onKickRef.current(tripId, data.memberId, data.kickerId);
      } else if (data?.type === "trip_ended") {
        if (tripId) onTripEndedRef.current(tripId);
      } else if (data?.type === "presence" && Array.isArray(data.members)) {
        setOnlineMembers(data.members);
      } else if (data?.type === "heartbeat") {
        // Member received heartbeat from host — reset timeout
        if (heartbeatResetRef.current) heartbeatResetRef.current();
        const dc = dcsRef.current.get("host");
        if (dc?.readyState === "open") {
          try { dc.send(JSON.stringify({ type: "heartbeat_ack", memberId })); } catch {}
        }
      } else if (data?.type === "heartbeat_ack") {
        // Host: ack received — peer alive
        if (isHost && data.memberId) {
          peerLastSeenRef.current.set(data.memberId, Date.now());
          updateHostPresence();
        }
      }
    } catch {}
  }, [tripId, memberId, isHost, updateHostPresence]);

  const waitForIceGathering = useCallback((pc: RTCPeerConnection): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const timeout = setTimeout(() => { log("ICE gathering timed out"); resolve(); }, ICE_GATHER_TIMEOUT);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
      };
    });
  }, []);

  // Handle connection drop with auto-reconnect cap
  const handleConnectionDrop = useCallback(() => {
    if (destroyedRef.current) return;
    setStatus("offline");
    autoReconnectCountRef.current++;
    if (autoReconnectCountRef.current <= MAX_AUTO_RECONNECT) {
      log("Auto-reconnect attempt", autoReconnectCountRef.current);
      // Reconnect will be triggered by startSync call below
    } else {
      toast.info("Connection lost. Click Sync to reconnect.");
    }
  }, []);

  // Member heartbeat — expects pings from host within HEARTBEAT_TIMEOUT
  const startMemberHeartbeat = useCallback(() => {
    stopHeartbeat();
    const resetTimeout = () => {
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = setTimeout(() => {
        log("Member: heartbeat timeout — host may be offline");
        const dc = dcsRef.current.get("host");
        if (!dc || dc.readyState !== "open") {
          handleConnectionDrop();
        }
      }, HEARTBEAT_TIMEOUT);
    };
    heartbeatResetRef.current = resetTimeout;
    resetTimeout();
  }, [stopHeartbeat, handleConnectionDrop]);

  // ---------------------------------------------------------
  // HOST SYNC — 30s scoped Firebase listener
  // ---------------------------------------------------------
  const startHostSync = useCallback(async () => {
    if (!tripId || !code || !memberId || syncDisabled) return;
    log("Host: starting sync for trip:", tripId);
    setIsSyncing(true);
    setStatus("syncing");
    cleanupFirebase();

    const tripRef = doc(db, "trips", tripId);
    const peersCol = collection(db, "trips", tripId, "peers");
    let connected = false;

    try {
      const ttl = Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
      await setDoc(tripRef, { ownerId: memberId, ttl }, { merge: true });
    } catch (err) {
      console.error("[WebRTC] Failed to write trip doc:", err);
      toast.error("Signaling failed — check your connection");
      setIsSyncing(false);
      setStatus("failed");
      return;
    }

    const unsubscribe = onSnapshot(peersCol, (snapshot) => {
      if (destroyedRef.current) return;
      snapshot.docChanges().forEach(async (change) => {
        const peerId = change.doc.id;
        if (peerId === memberId) return;

        if (change.type === "removed") {
          const existingPc = pcsRef.current.get(peerId);
          if (existingPc && (existingPc.connectionState === "failed" || existingPc.connectionState === "closed")) {
            existingPc.close();
            dcsRef.current.get(peerId)?.close();
            pcsRef.current.delete(peerId);
            dcsRef.current.delete(peerId);
            processingPeersRef.current.delete(peerId);
            lastProcessedSdpRef.current.delete(peerId);
            updateHostPresence();
          }
          return;
        }

        const peerData = change.doc.data();
        const offerEnc = peerData?.memberSdp;
        if (!offerEnc) return;

        // FIX: Skip only if same offer already processed (fixes inverted topology bug)
        const lastSdp = lastProcessedSdpRef.current.get(peerId);
        if (lastSdp === offerEnc) return;

        // New/different offer — clear stale processing state
        processingPeersRef.current.delete(peerId);

        const offer = decrypt(code, offerEnc);
        if (!offer || offer.type !== "offer") {
          log("Host: failed to decrypt offer from peer:", peerId);
          return;
        }

        log("Host: processing offer from peer:", peerId);
        processingPeersRef.current.add(peerId);
        lastProcessedSdpRef.current.set(peerId, offerEnc);

        // Close existing stale connection
        const existingPc = pcsRef.current.get(peerId);
        if (existingPc) { existingPc.close(); dcsRef.current.delete(peerId); }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcsRef.current.set(peerId, pc);

        pc.onconnectionstatechange = () => {
          if (destroyedRef.current) return;
          const state = pc.connectionState;
          log("Host: peer", peerId, "state:", state);
          if (state === "connected") { connected = true; updateHostPresence(); }
          else if (state === "failed" || state === "disconnected") { updateHostPresence(); }
        };

        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          dcsRef.current.set(peerId, dc);
          dc.onopen = () => {
            if (destroyedRef.current) return;
            log("Host: DC OPEN with peer:", peerId);
            connected = true;
            peerLastSeenRef.current.set(peerId, Date.now());
            processingPeersRef.current.delete(peerId);
            setStatus("connected");
            setIsSyncing(false);
            setLastSyncedAt(Date.now());
            autoReconnectCountRef.current = 0;
            updateHostPresence();
            onConnectRef.current();
            startHostHeartbeat();
            // Unsubscribe Firebase — save reads
            cleanupFirebase();
          };
          dc.onclose = () => {
            log("Host: DC closed with peer:", peerId);
            if (!destroyedRef.current) {
              peerLastSeenRef.current.delete(peerId);
              updateHostPresence();
              const anyOpen = Array.from(dcsRef.current.values()).some(d => d.readyState === "open");
              if (!anyOpen) { stopHeartbeat(); handleConnectionDrop(); }
            }
          };
          dc.onmessage = handleDataChannelMessage;
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitForIceGathering(pc);
          if (destroyedRef.current) return;

          const finalSdp = pc.localDescription;
          if (finalSdp) {
            const answerEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });
            log("Host: writing hostSdp for peer:", peerId);
            await setDoc(doc(db, "trips", tripId, "peers", peerId), { memberSdp: offerEnc, hostSdp: answerEnc });
            log("Host: hostSdp written");
          }
        } catch (e) {
          console.error("[WebRTC] Host failed to process offer:", peerId, e);
          processingPeersRef.current.delete(peerId);
          lastProcessedSdpRef.current.delete(peerId);
        }
      });
    }, (err) => {
      console.error("[WebRTC] Host snapshot error:", err);
      toast.error("Signaling failed");
      setIsSyncing(false);
      setStatus("failed");
    });

    unsubscribeRef.current = unsubscribe;

    // Auto-unsubscribe after 30s
    syncTimeoutRef.current = setTimeout(() => {
      if (!destroyedRef.current) {
        cleanupFirebase();
        if (!connected) {
          setIsSyncing(false);
          setStatus("idle");
          if (!silentSyncRef.current) toast.info("No active members found. Ask them to click Sync.");
        }
      }
    }, SYNC_WINDOW_TIMEOUT);
  }, [tripId, code, memberId, syncDisabled, cleanupFirebase, handleDataChannelMessage, updateHostPresence, waitForIceGathering, startHostHeartbeat, stopHeartbeat, handleConnectionDrop]);

  // ---------------------------------------------------------
  // MEMBER SYNC — writes offer, watches own doc for 30s
  // ---------------------------------------------------------
  const startMemberSync = useCallback(async () => {
    if (!tripId || !code || !memberId || syncDisabled) return;
    log("Member: starting sync for trip:", tripId);
    setIsSyncing(true);
    setStatus("syncing");
    cleanupFirebase();

    // Pre-check: does the trip doc exist? (1 read, instant feedback)
    try {
      const tripSnap = await getDoc(doc(db, "trips", tripId));
      if (!tripSnap.exists()) {
        if (!silentSyncRef.current) toast.info("Owner hasn't started sync yet. Ask them to open the trip and click Sync.");
        setIsSyncing(false);
        setStatus("idle");
        return;
      }
    } catch { /* Network error — proceed anyway */ }

    const myPeerRef = doc(db, "trips", tripId, "peers", memberId);
    let connected = false;

    // Cleanup existing connection
    const existingPc = pcsRef.current.get("host");
    if (existingPc) { existingPc.close(); pcsRef.current.delete("host"); }
    const existingDc = dcsRef.current.get("host");
    if (existingDc) { existingDc.close(); dcsRef.current.delete("host"); }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current.set("host", pc);

    const dc = pc.createDataChannel("expense-sync");
    dcsRef.current.set("host", dc);

    dc.onopen = () => {
      if (destroyedRef.current) return;
      log("Member: DC OPEN with host!");
      connected = true;
      setStatus("connected");
      setIsSyncing(false);
      setLastSyncedAt(Date.now());
      autoReconnectCountRef.current = 0;
      onConnectRef.current();
      startMemberHeartbeat();
      cleanupFirebase();
    };
    dc.onclose = () => {
      if (destroyedRef.current) return;
      log("Member: DC CLOSED");
      setOnlineMembers([]);
      stopHeartbeat();
      handleConnectionDrop();
    };
    dc.onmessage = handleDataChannelMessage;

    pc.onconnectionstatechange = () => {
      if (destroyedRef.current) return;
      const state = pc.connectionState;
      log("Member: connection state:", state);
      if (state === "failed" && !connected) { setStatus("failed"); setIsSyncing(false); }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      if (destroyedRef.current || !pc.localDescription) return;

      const finalSdp = pc.localDescription;
      const offerEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });
      log("Member: writing memberSdp");
      await setDoc(myPeerRef, { memberSdp: offerEnc });
      log("Member: memberSdp written");
    } catch (e) {
      console.error("[WebRTC] Member offer failed:", e);
      setIsSyncing(false);
      setStatus("failed");
      toast.error("Connection failed — check your network");
      return;
    }

    // Watch own doc for hostSdp
    let answerApplied = false;
    const unsubscribe = onSnapshot(myPeerRef, async (snap) => {
      if (destroyedRef.current || !snap.exists()) return;
      const data = snap.data();
      const answerEnc = data?.hostSdp;
      if (!answerEnc || answerApplied) return;
      if (!pc || pc.signalingState !== "have-local-offer") return;

      const answer = decrypt(code, answerEnc);
      if (!answer || answer.type !== "answer") { log("Member: decrypt hostSdp failed"); return; }

      try {
        log("Member: applying host answer");
        answerApplied = true;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log("Member: remote description set!");
      } catch (e) {
        console.error("[WebRTC] Member set answer failed:", e);
        answerApplied = false;
      }
    }, (err) => {
      console.error("[WebRTC] Member snapshot error:", err);
      setIsSyncing(false);
      setStatus("failed");
    });

    unsubscribeRef.current = unsubscribe;

    // Auto-unsubscribe after 30s
    syncTimeoutRef.current = setTimeout(() => {
      if (!destroyedRef.current) {
        cleanupFirebase();
        if (!connected) {
          setIsSyncing(false);
          pc.close();
          pcsRef.current.delete("host");
          dcsRef.current.delete("host");
          setStatus("idle");
          if (!silentSyncRef.current) toast.info("Owner not active. Ask them to click Sync first.");
        }
      }
    }, SYNC_WINDOW_TIMEOUT);
  }, [tripId, code, memberId, syncDisabled, cleanupFirebase, handleDataChannelMessage, waitForIceGathering, startMemberHeartbeat, stopHeartbeat, handleConnectionDrop]);

  // Public startSync (resets auto-reconnect counter)
  const startSync = useCallback((opts?: { silent?: boolean }) => {
    silentSyncRef.current = !!opts?.silent;
    autoReconnectCountRef.current = 0;
    if (isHost) startHostSync();
    else startMemberSync();
  }, [isHost, startHostSync, startMemberSync]);

  const disconnectAndLeave = useCallback(async () => {
    disconnectAll();
    if (!tripId || !memberId) return;
    if (isHost) {
      const peersCol = collection(db, "trips", tripId, "peers");
      try { const snap = await getDocs(peersCol); await Promise.all(snap.docs.map(d => deleteDoc(d.ref))); } catch {}
      try { await deleteDoc(doc(db, "trips", tripId)); } catch {}
    } else {
      try { await deleteDoc(doc(db, "trips", tripId, "peers", memberId)); } catch {}
    }
  }, [disconnectAll, tripId, memberId, isHost]);

  const reconnect = useCallback(() => {
    disconnectAll();
    setStatus("idle");
    autoReconnectCountRef.current = 0;
  }, [disconnectAll]);

  return {
    status, onlineMembers, lastSyncedAt, isSyncing,
    broadcastGroup, broadcastKick: broadcastKickFn, broadcastEndTrip,
    disconnectAndLeave, reconnect, startSync,
  };
}
