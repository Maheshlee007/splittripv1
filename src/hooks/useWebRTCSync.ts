import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc, arrayUnion, deleteField } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Group } from "@/lib/types";
import { safeParseGroup } from "@/lib/schema";

export type SyncStatus = "connecting" | "signaling" | "connected" | "offline" | "failed";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

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

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dcsRef = useRef<Map<string, RTCDataChannel>>(new Map());

  const disconnectAll = useCallback(() => {
    dcsRef.current.forEach(dc => dc.close());
    pcsRef.current.forEach(pc => pc.close());
    dcsRef.current.clear();
    pcsRef.current.clear();
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
    dcsRef.current.forEach(dc => {
      if (dc.readyState === "open") {
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
        if (parsed.success) onRemoteGroup(parsed.data as Group);
      } else if (data?.type === "kick" && data.memberId && data.kickerId) {
        if (tripId) onKick(tripId, data.memberId, data.kickerId);
      } else if (data?.type === "trip_ended") {
        if (tripId) onTripEnded(tripId);
      } else if (data?.type === "presence" && Array.isArray(data.members)) {
        setOnlineMembers(data.members);
      }
    } catch {}
  }, [onRemoteGroup, onKick, onTripEnded, tripId]);


  // ---------------------------------------------------------
  // HOST LOGIC
  // ---------------------------------------------------------
  useEffect(() => {
    if (!tripId || !code || !memberId || !isHost || syncDisabled) return;

    setStatus("signaling");
    const tripRef = doc(db, "trips", tripId);

    const expireAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    setDoc(tripRef, { expireAt, ownerId: memberId }, { merge: true }).catch(console.error);

    const unsubscribe = onSnapshot(tripRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const membersMap = data.members || {};

      // Check all members in the map
      Object.keys(membersMap).forEach(async (peerId) => {
        if (peerId === memberId) return;

        const memberData = membersMap[peerId];
        const memberSdpEnc = memberData.memberSdp;
        const memberVersion = memberData.version || 0;

        let pc = pcsRef.current.get(peerId);
        const currentVersion = pc ? (pc as any)._version : -1;

        if (memberSdpEnc && memberVersion > currentVersion) {
          const memberSdp = decrypt(code, memberSdpEnc);
          if (memberSdp && memberSdp.type === "offer") {
            if (pc) {
              pc.close();
              dcsRef.current.delete(peerId);
            }

            pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            (pc as any)._version = memberVersion;
            pcsRef.current.set(peerId, pc);

            pc.onconnectionstatechange = () => {
              if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") {
                updateHostPresence();
              }
            };

            pc.ondatachannel = (ev) => {
              const dc = ev.channel;
              dcsRef.current.set(peerId, dc);
              dc.onopen = () => {
                updateHostPresence();
                onConnect();
              };
              dc.onclose = updateHostPresence;
              dc.onmessage = handleDataChannelMessage;
            };

            pc.onicecandidate = () => {};

            try {
              await pc.setRemoteDescription(memberSdp);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              await new Promise<void>((res) => {
                if (pc?.iceGatheringState === "complete") return res();
                if (pc) pc.onicegatheringstatechange = () => pc?.iceGatheringState === "complete" && res();
                setTimeout(res, 3000);
              });
              
              const finalSdp = pc.localDescription;
              if (finalSdp) {
                const hostSdpEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });
                await updateDoc(tripRef, { 
                  [`members.${peerId}.hostSdp`]: hostSdpEnc,
                  [`members.${peerId}.hostVersion`]: memberVersion
                });
              }
            } catch (e) {
              console.error("Host failed to process offer:", e);
            }
          }
        }
      });

      // Cleanup peers that were removed from the document
      const activePeerIds = Object.keys(membersMap);
      pcsRef.current.forEach((pc, peerId) => {
        if (!activePeerIds.includes(peerId) && peerId !== memberId) {
          pc.close();
          const dc = dcsRef.current.get(peerId);
          if (dc) dc.close();
          pcsRef.current.delete(peerId);
          dcsRef.current.delete(peerId);
          updateHostPresence();
        }
      });
    });

    return () => {
      unsubscribe();
      disconnectAll();
    };
  }, [tripId, code, memberId, isHost, syncDisabled, disconnectAll, handleDataChannelMessage, updateHostPresence, onConnect]);


  // ---------------------------------------------------------
  // MEMBER LOGIC
  // ---------------------------------------------------------
  useEffect(() => {
    if (!tripId || !code || !memberId || isHost || syncDisabled) return;

    setStatus("signaling");
    const tripRef = doc(db, "trips", tripId);
    let initialVersion = Date.now();
    let currentVersion = initialVersion;
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let unsubscribe: () => void = () => {};

    const setupConnection = async () => {
      if (pc) {
        pc.close();
        if (dc) dc.close();
      }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set("host", pc);
      (pc as any)._version = currentVersion;

      dc = pc.createDataChannel("expense-sync");
      dcsRef.current.set("host", dc);
      
      dc.onopen = () => {
        setStatus("connected");
        onConnect();
      };
      dc.onclose = () => {
        setStatus("signaling");
        setOnlineMembers([]);
      };
      dc.onmessage = handleDataChannelMessage;

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") {
          currentVersion = Date.now();
          setupConnection();
        }
      };

      pc.onicecandidate = () => {};

      try {
        const offer = await pc.createOffer({ iceRestart: currentVersion > initialVersion });
        await pc.setLocalDescription(offer);

        await new Promise<void>((res) => {
          if (pc?.iceGatheringState === "complete") return res();
          if (pc) pc.onicegatheringstatechange = () => pc?.iceGatheringState === "complete" && res();
          setTimeout(res, 3000);
        });

        const finalSdp = pc.localDescription;
        if (finalSdp) {
          const memberSdpEnc = encrypt(code, { type: finalSdp.type, sdp: finalSdp.sdp });
          
          await setDoc(tripRef, {
            members: {
              [memberId]: {
                memberSdp: memberSdpEnc,
                version: currentVersion,
                joinedAt: Date.now()
              }
            }
          }, { merge: true });
        }

      } catch (e) {
        console.error("Member failed to create offer:", e);
        setStatus("failed");
      }
    };

    setupConnection();

    unsubscribe = onSnapshot(tripRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const myData = data.members?.[memberId] || {};
      const hostSdpEnc = myData.hostSdp;
      const hostVersion = myData.hostVersion || 0;

      if (pc && hostSdpEnc && hostVersion === currentVersion && pc.signalingState === "have-local-offer") {
        const hostSdp = decrypt(code, hostSdpEnc);
        if (hostSdp && hostSdp.type === "answer") {
          try {
            await pc.setRemoteDescription(hostSdp);
          } catch (e) {
             console.error("Member failed to set remote answer:", e);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      if (pc) pc.close();
      if (dc) dc.close();
      disconnectAll();
    };
  }, [tripId, code, memberId, isHost, syncDisabled, disconnectAll, handleDataChannelMessage, onConnect]);

  const disconnectAndLeave = useCallback(async () => {
    disconnectAll();
    if (!tripId || !memberId) return;
    const tripRef = doc(db, "trips", tripId);
    if (isHost) {
      try { await deleteDoc(tripRef); } catch {}
    } else {
      try { await updateDoc(tripRef, { [`members.${memberId}`]: deleteField() }); } catch {}
    }
  }, [disconnectAll, tripId, memberId, isHost]);

  return { status, onlineMembers, broadcastGroup, broadcastKick: broadcastKickFn, broadcastEndTrip, disconnectAndLeave };
}
