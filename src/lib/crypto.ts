/**
 * MQTT signaling crypto helpers.
 *
 * Goals (security finding mqtt_ip_leakage):
 *  - The MQTT topic must NOT contain the plain group code (it would leak active
 *    rooms to anyone subscribing to splittrip/+/...).
 *  - The AES key must NOT equal a topic segment, so a passive subscriber who can
 *    read the topic can't decrypt the envelope.
 *
 * Both topic and key are deterministically derived from the group code with
 * different salts so they look unrelated to outside observers but every legit
 * peer with the code can re-derive them.
 */
import CryptoJS from "crypto-js";

const TOPIC_SALT = "splittrip-mqtt-topic-v1";
const KEY_SALT = "splittrip-mqtt-key-v1";

/** 16-char hex slice of HMAC-SHA256(code, TOPIC_SALT). */
export function hashedTopicSegment(code: string): string {
  const h = CryptoJS.HmacSHA256(code.toUpperCase(), TOPIC_SALT).toString(CryptoJS.enc.Hex);
  return h.slice(0, 16);
}

/** 256-bit AES key derived from the code with PBKDF2 (separate salt). */
export function deriveSignalKey(code: string): string {
  return CryptoJS.PBKDF2(code.toUpperCase(), KEY_SALT, {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString(CryptoJS.enc.Hex);
}

/** Drop ICE candidates whose `typ` is `host` so LAN IPs are never broadcast. */
export function isHostCandidate(c: RTCIceCandidateInit | null | undefined): boolean {
  if (!c?.candidate) return false;
  return / typ host\b/i.test(c.candidate);
}
