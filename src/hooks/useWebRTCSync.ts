import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot, deleteDoc, collection, getDocs } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Group } from "@/lib/types";
import { safeParseGroup } from "@/lib/schema";
import { toast } from "sonner";

export type SyncStatus = "connecting" | "signaling" | "connected" | "offline" | "failed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

/** Time to wait for ICE gathering to complete before using available candidates */
const ICE_GATHER_TIMEOUT = 8000;
/** Initial delay before reconnection attempt */
const RECONNECT_DELAY_INITIAL = 4000;
/** Maximum delay between reconnection attempts (exponential backoff cap) */
const RECONNECT_DELAY_MAX = 60000;
/** SDP offer timeout — if host doesn't answer within this, re-offer with fresh ICE */
const SDP_OFFER_TIMEOUT = 90_000;

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
 * Firestore signaling structure (minimal — SDP exchange only):
 *
 *   trips/{tripId}                    → { ownerId }                 // identifies host
 *   trips/{tripId}/peers/{peerId}     → { memberSdp, hostSdp? }    // per-member signaling
 *
 * Flow:
 * 1. Owner opens trip → writes { ownerId } to trip doc, watches peers/ subcollection
 * 2. Member joins → creates offer → writes { memberSdp } to peers/{memberId}
 * 3. Host sees new peer doc → creates answer → writes { hostSdp } to SAME peer doc
 * 4. Member watches ONLY their own peer doc → sees hostSdp → connection established
 * 5. Peer doc is KEPT (not deleted) — enables reconnection without extra writes
 * 6. All data (expenses, approvals, etc.) flows over WebRTC data channel
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
  const [status, setStatus] = useState<SyncStatus>("offline");
  const [onlineMembers, setOnlineMembers] = useState<string[]>([]);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dcsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const onRemoteGroupRef = useRef(onRemoteGroup);
  const onKickRef = useRef(onKick);
  const onTripEndedRef = useRef(onTripEnded);
  const onConnectRef = useRef(onConnect);
  /** Track which peer offers the host is currently processing (to avoid double-handling) */
  const processingPeersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onRemoteGroupRef.current = onRemoteGroup;
  }, [onRemoteGroup]);

  useEffect(() => {
    onKickRef.current = onKick;
  }, [onKick]);

  useEffect(() => {
    onTripEndedRef.current = onTripEnded;
  }, [onTripEnded]);

  useEffect(() => {
    onConnectRef.current = onConnect;
  }, [onConnect]);

  const disconnectAll = useCallback(() => {
    dcsRef.current.forEach(dc => dc.close());
    pcsRef.current.forEach(pc => pc.close());
    dcsRef.current.clear();
    pcsRef.current.clear();
    processingPeersRef.current.clear();
    setOnlineMembers([]);
    setStatus("offline");
  }, []);

  const broadcastPresence = useCallback((members: string[]) => {
    const payload = JSON.stringify({ type: "presence", members });
    dcsRef.current.forEach(dc => {
      if (dc.readyState === "open") {
        try { dc.send(payload); } catch {}
      }
    });
  }, []);

  const updateHostPresence = useCallback(() => {
    if (!isHost || !memberId) return;
    const activeIds = Array.from(dcsRef.current.entries())
      .filter(([_, dc]) => dc.readyState === "open")
      .map(([id]) => id);
    const online = [memberId, ...activeIds];
    setOnlineMembers(online);
    setStatus(online.length > 1 ? "connected" : "signaling");
    broadcastPresence(online);
  }, [isHost, memberId, broadcastPresence]);

  const broadcastGroup = useCallback((g: Group) => {
    const payload = JSON.stringify({ type: "snapshot", group: JSON.parse(JSON.stringify(g)) });
    // Only send to approved members (active status) or to "host" key used by members
    const approvedIds = new Set(
      g.members.filter(m => m.status === "active").map(m => m.id)
    );
    dcsRef.current.forEach((dc, peerId) => {
      if (dc.readyState === "open" && (approvedIds.has(peerId) || peerId === "host")) {
        try { dc.send(payload); } catch {}
      }
    });
  }, []);

  const broadcastKickFn = useCallback((targetId: string, kickerId: string) => {
    const payload = JSON.stringify({ type: "kick", memberId: targetId, kickerId });
    dcsRef.current.forEach(dc => {
      if (dc.readyState === "open") {
        try { dc.send(payload); } catch {}
      }
    });
  }, []);

  const broadcastEndTrip = useCallback(() => {
    const payload = JSON.stringify({ type: "trip_ended" });
    dcsRef.current.forEach(dc => {
      if (dc.readyState === "open") {
        try { dc.send(payload); } catch {}
      }
    });
  }, []);

  const handleDataChannelMessage = useCallback((ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "snapshot" && data.group) {
        const parsed = safeParseGroup(data.group);
        if (parsed.success) onRemoteGroupRef.current(parsed.data as Group);
      } else if (data?.type === "kick" && data.memberId && data.kickerId) {
        if (tripId) onKickRef.current(tripId, data.memberId, data.kickerId);
      } else if (data?.type === "trip_ended") {
        if (tripId) onTripEndedRef.current(tripId);
      } else if (data?.type === "presence" && Array.isArray(data.members)) {
        setOnlineMembers(data.members);
      }
    } catch {}
  }, [tripId]);

  /** Wait for ICE gathering with proper timeout */
  const waitForIceGathering = useCallback((pc: RTCPeerConnection): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const timeout = setTimeout(() => {
        log("ICE gathering timed out, using available candidates");
        resolve();
      }, ICE_GATHER_TIMEOUT);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          log("ICE gathering complete");
          resolve();
        }
      };
    });
  }, []);


  // ---------------------------------------------------------
  // HOST LOGIC — watches peers subcollection for new offers
  // ---------------------------------------------------------
  useEffect(() => {
    if (!tripId || !code || !memberId || !isHost || syncDisabled) return;

    log("Host starting signaling for trip:", tripId);
    setStatus("signaling");
    const tripRef = doc(db, "trips", tripId);
    const peersCol = collection(db, "trips", tripId, "peers");
    let destroyed = false;

    // Initialize the trip signaling document (ownerId only)
    setDoc(tripRef, { ownerId: memberId }, { merge: true }).catch((err) => {
      console.error("[WebRTC] Failed to write trip doc:", err);
      toast.error("Signaling failed — check connection or use QR fallback");
    });

    // Watch the peers subcollection for new offers
    const unsubscribe = onSnapshot(peersCol, (snapshot) => {
      if (destroyed) return;

      snapshot.docChanges().forEach(async (change) => {
        const peerId = change.doc.id;
        if (peerId === memberId) return;

        if (change.type === "removed") {
          // Only tear down if the connection is already dead
          const existingPc = pcsRef.current.get(peerId);
          if (existingPc && (existingPc.connectionState === "failed" || existingPc.connectionState === "closed")) {
            existingPc.close();
            dcsRef.current.get(peerId)?.close();
            pcsRef.current.delete(peerId);
            dcsRef.current.delete(peerId);
            processingPeersRef.current.delete(peerId);
            updateHostPresence();
          }
          return;
        }

        // added or modified — check for new offer
        const peerData = change.doc.data();
        const offerEnc = peerData?.memberSdp;
        if (!offerEnc) return;

        // If already processing this peer, skip
        if (processingPeersRef.current.has(peerId)) return;

        // If we already wrote an answer and it hasn't been consumed yet, skip
        if (peerData?.hostSdp) return;

        const offer = decrypt(code, offerEnc);
        if (!offer || offer.type !== "offer") {
          log("Host: failed to decrypt offer from peer:", peerId);
          return;
        }

        log("Host: processing new offer from peer:", peerId);
        processingPeersRef.current.add(peerId);

        // Close existing connection for this peer (stale)
        const existingPc = pcsRef.current.get(peerId);
        if (existingPc) {
          existingPc.close();
          dcsRef.current.delete(peerId);
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcsRef.current.set(peerId, pc);

        pc.onconnectionstatechange = () => {
          if (destroyed) return;
          const state = pc.connectionState;
          log("Host: peer", peerId, "connection state:", state);
          if (state === "failed" || state === "disconnected") {
            updateHostPresence();
          } else if (state === "connected") {
            updateHostPresence();
          }
        };

        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          log("Host: data channel received from peer:", peerId, "label:", dc.label);
          dcsRef.current.set(peerId, dc);
          dc.onopen = () => {
            if (destroyed) return;
            log("Host: data channel OPEN with peer:", peerId);
            processingPeersRef.current.delete(peerId);
            updateHostPresence();
            // Send initial group state to the newly connected peer
            onConnectRef.current();
          };
          dc.onclose = () => {
            log("Host: data channel closed with peer:", peerId);
            if (!destroyed) updateHostPresence();
          };
          dc.onmessage = handleDataChannelMessage;
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await waitForIceGathering(pc);

          if (destroyed) return;

          const finalSdp = pc.localDescription;
          if (finalSdp) {
            const answerEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });
            log("Host: writing hostSdp for peer:", peerId);
            // Write answer back to the SAME peer doc (keep memberSdp to avoid re-trigger)
            await setDoc(doc(db, "trips", tripId, "peers", peerId), {
              memberSdp: offerEnc,
              hostSdp: answerEnc,
            });
            log("Host: hostSdp written for peer:", peerId);
          }
        } catch (e) {
          console.error("[WebRTC] Host failed to process offer from", peerId, e);
          processingPeersRef.current.delete(peerId);
          toast.error("Failed to process peer connection — try again");
        }
      });
    }, (err) => {
      console.error("[WebRTC] Host: Firestore snapshot error:", err);
      toast.error("Signaling connection lost — use QR fallback if needed");
      setStatus("failed");
    });

    // Handle network changes
    const handleNetworkChange = () => {
      if (destroyed) return;
      log("Host: network change, refreshing presence");
      updateHostPresence();
    };
    window.addEventListener("online", handleNetworkChange);

    return () => {
      destroyed = true;
      window.removeEventListener("online", handleNetworkChange);
      unsubscribe();
      disconnectAll();
    };
  }, [tripId, code, memberId, isHost, syncDisabled, reconnectTrigger, disconnectAll, handleDataChannelMessage, updateHostPresence, waitForIceGathering]);


  // ---------------------------------------------------------
  // MEMBER LOGIC — writes offer to own peer doc, watches for answer
  // ---------------------------------------------------------
  useEffect(() => {
    if (!tripId || !code || !memberId || isHost || syncDisabled) return;

    log("Member starting signaling for trip:", tripId, "memberId:", memberId);
    setStatus("signaling");
    const myPeerRef = doc(db, "trips", tripId, "peers", memberId);
    let destroyed = false;
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let offerTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let answerApplied = false;

    const setupConnection = async () => {
      if (destroyed) return;

      log("Member: setting up connection");

      // Clean up previous connection + timers
      if (pc) { pc.close(); pc = null; }
      if (dc) { dc.close(); dc = null; }
      if (offerTimeoutTimer) { clearTimeout(offerTimeoutTimer); offerTimeoutTimer = null; }
      answerApplied = false;

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set("host", pc);

      dc = pc.createDataChannel("expense-sync");
      dcsRef.current.set("host", dc);

      dc.onopen = () => {
        if (destroyed) return;
        log("Member: data channel OPEN with host!");
        reconnectAttempt = 0;
        if (offerTimeoutTimer) { clearTimeout(offerTimeoutTimer); offerTimeoutTimer = null; }
        setStatus("connected");
        onConnectRef.current();
        // Do NOT delete peer doc — keep it for reconnection (saves Firebase operations)
      };
      dc.onclose = () => {
        if (destroyed) return;
        log("Member: data channel CLOSED");
        setStatus("signaling");
        setOnlineMembers([]);
        scheduleReconnect();
      };
      dc.onmessage = handleDataChannelMessage;

      pc.onconnectionstatechange = () => {
        if (destroyed || !pc) return;
        const state = pc.connectionState;
        log("Member: connection state:", state);
        if (state === "failed") {
          log("Member: connection failed, will reconnect");
          setStatus("signaling");
          scheduleReconnect();
        } else if (state === "connected") {
          log("Member: ICE connected to host");
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (destroyed || !pc) return;
        log("Member: ICE connection state:", pc.iceConnectionState);
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        log("Member: offer created, waiting for ICE gathering...");

        await waitForIceGathering(pc);

        if (destroyed || !pc || !pc.localDescription) return;

        const finalSdp = pc.localDescription;
        const offerEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });

        log("Member: writing memberSdp to own peer doc");

        // Write offer to own peer document (overwrite — removes stale hostSdp)
        await setDoc(myPeerRef, { memberSdp: offerEnc });

        log("Member: memberSdp written successfully");

        // Auto-refresh offer if host doesn't respond within SDP_OFFER_TIMEOUT
        // ICE candidates expire due to NAT binding timeouts (30s–2min)
        offerTimeoutTimer = setTimeout(() => {
          if (!destroyed && !answerApplied) {
            log("Member: offer timed out (ICE candidates likely expired), re-offering");
            setupConnection();
          }
        }, SDP_OFFER_TIMEOUT);

      } catch (e) {
        console.error("[WebRTC] Member failed to create offer:", e);
        if (!destroyed) {
          setStatus("failed");
          toast.error("Connection failed — try QR fallback if host is unavailable");
          scheduleReconnect();
        }
      }
    };

    let reconnectAttempt = 0;

    const scheduleReconnect = () => {
      if (destroyed || reconnectTimer) return;
      const delay = Math.min(RECONNECT_DELAY_INITIAL * Math.pow(2, reconnectAttempt), RECONNECT_DELAY_MAX);
      reconnectAttempt++;
      log("Member: scheduling reconnect in", delay, "ms (attempt", reconnectAttempt, ")");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (destroyed) return;
        setupConnection();
      }, delay);
    };

    // Start initial connection
    setupConnection();

    // Watch own peer doc for the host's answer
    const unsubscribe = onSnapshot(myPeerRef, async (snap) => {
      if (destroyed || !snap.exists()) return;
      const data = snap.data();
      const answerEnc = data?.hostSdp;

      if (!answerEnc || answerApplied) return;
      if (!pc || pc.signalingState !== "have-local-offer") return;

      const answer = decrypt(code, answerEnc);
      if (!answer || answer.type !== "answer") {
        log("Member: failed to decrypt hostSdp or not an answer type");
        return;
      }

      try {
        log("Member: applying host answer SDP");
        answerApplied = true;
        if (offerTimeoutTimer) { clearTimeout(offerTimeoutTimer); offerTimeoutTimer = null; }
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log("Member: remote description set successfully!");
      } catch (e) {
        console.error("[WebRTC] Member failed to set remote answer:", e);
        answerApplied = false;
        scheduleReconnect();
      }
    }, (err) => {
      console.error("[WebRTC] Member: Firestore snapshot error:", err);
      toast.error("Signaling connection lost — use QR fallback if needed");
      setStatus("failed");
    });

    // Handle network changes (WiFi switch)
    const handleNetworkChange = () => {
      if (destroyed) return;
      log("Member: network change detected, reconnecting");
      setupConnection();
    };
    window.addEventListener("online", handleNetworkChange);

    return () => {
      destroyed = true;
      window.removeEventListener("online", handleNetworkChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (offerTimeoutTimer) clearTimeout(offerTimeoutTimer);
      unsubscribe();
      if (pc) pc.close();
      if (dc) dc.close();
      disconnectAll();
    };
  }, [tripId, code, memberId, isHost, syncDisabled, reconnectTrigger, disconnectAll, handleDataChannelMessage, waitForIceGathering]);

  const disconnectAndLeave = useCallback(async () => {
    disconnectAll();
    if (!tripId || !memberId) return;
    if (isHost) {
      // Delete the trip doc and all peer subdocs (permanent leave/delete only)
      const peersCol = collection(db, "trips", tripId, "peers");
      try {
        const snap = await getDocs(peersCol);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } catch {}
      try { await deleteDoc(doc(db, "trips", tripId)); } catch {}
    } else {
      // Delete own peer doc
      try { await deleteDoc(doc(db, "trips", tripId, "peers", memberId)); } catch {}
    }
  }, [disconnectAll, tripId, memberId, isHost]);

  const reconnect = useCallback(() => {
    disconnectAll();
    setReconnectTrigger(prev => prev + 1);
  }, [disconnectAll]);

  return { status, onlineMembers, broadcastGroup, broadcastKick: broadcastKickFn, broadcastEndTrip, disconnectAndLeave, reconnect };
}
