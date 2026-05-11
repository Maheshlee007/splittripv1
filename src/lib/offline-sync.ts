import { safeParseGroup } from "./schema";
import { Group } from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let activePc: RTCPeerConnection | null = null;
let activeDc: RTCDataChannel | null = null;

export interface OfflineCallbacks {
  onRemoteGroup: (g: Group) => void;
  onRemoteKick: (groupId: string, memberId: string, kickerId: string) => void;
  setBroadcaster: (fn: ((g: Group) => void) | null) => void;
  setKickCaster: (fn: ((target: string, kicker: string) => void) | null) => void;
}

function setupDataChannel(dc: RTCDataChannel, groupId: string, cb: OfflineCallbacks) {
  dc.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "snapshot" && data.group) {
        const parsed = safeParseGroup(data.group);
        if (parsed.success) cb.onRemoteGroup(parsed.data as Group);
      } else if (data?.type === "kick" && data.memberId && data.kickerId) {
        cb.onRemoteKick(groupId, data.memberId, data.kickerId);
      }
    } catch {}
  };
}

function bindOfflineBroadcaster(cb: OfflineCallbacks) {
  cb.setBroadcaster((g: Group) => {
    if (activeDc?.readyState === "open") {
      try { activeDc.send(JSON.stringify({ type: "snapshot", group: g })); } catch {}
    }
  });
  cb.setKickCaster((targetId: string, kickerId: string) => {
    if (activeDc?.readyState === "open") {
      try { activeDc.send(JSON.stringify({ type: "kick", memberId: targetId, kickerId })); } catch {}
    }
  });
}

export async function createOfflineOffer(groupId: string, cb: OfflineCallbacks): Promise<{
  sdp: string;
  applyAnswer: (answerSdp: string) => Promise<void>;
}> {
  if (activePc) { activePc.close(); }
  
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  activePc = pc;

  const dc = pc.createDataChannel("expense-sync");
  activeDc = dc;
  
  dc.onopen = () => bindOfflineBroadcaster(cb);
  setupDataChannel(dc, groupId, cb);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && res();
    setTimeout(res, 3000);
  });

  return {
    sdp: JSON.stringify(pc.localDescription),
    applyAnswer: async (answerSdp: string) => {
      await pc.setRemoteDescription(JSON.parse(answerSdp));
    },
  };
}

export async function acceptOfflineOffer(groupId: string, offerSdp: string, cb: OfflineCallbacks): Promise<string> {
  if (activePc) { activePc.close(); }
  
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  activePc = pc;

  pc.ondatachannel = (ev) => {
    activeDc = ev.channel;
    activeDc.onopen = () => bindOfflineBroadcaster(cb);
    setupDataChannel(activeDc, groupId, cb);
  };

  await pc.setRemoteDescription(JSON.parse(offerSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && res();
    setTimeout(res, 3000);
  });

  return JSON.stringify(pc.localDescription);
}
