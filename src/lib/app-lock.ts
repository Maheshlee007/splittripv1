/**
 * App Lock — local-only authentication gate.
 *
 * Two modes:
 *   - "biometric" : WebAuthn platform authenticator (Touch ID / Face ID /
 *                   Windows Hello / Android fingerprint). Native, no library.
 *                   Falls back to passcode if the device refuses.
 *   - "passcode"  : 4-6 digit PIN. Stored as PBKDF2-SHA256 hash + salt
 *                   in localStorage. Never leaves the device.
 *
 * Everything is stored locally; nothing is sent to a server.
 */

export type LockMode = "biometric" | "passcode";

const LS_ENABLED = "splittrip:lock:enabled";
const LS_MODE = "splittrip:lock:mode";
const LS_HASH = "splittrip:lock:hash";
const LS_SALT = "splittrip:lock:salt";
const LS_CRED_ID = "splittrip:lock:credId";
const LS_RP_ID = "splittrip:lock:rpId";

/** Session flag — cleared on tab close (sessionStorage). */
const SS_UNLOCKED = "splittrip:lock:unlocked";
/** Wall-clock timestamp when the tab was last hidden (sessionStorage). */
const SS_HIDDEN_AT = "splittrip:lock:hiddenAt";
/** Failed passcode attempt counter (sessionStorage). */
const SS_PIN_ATTEMPTS = "splittrip:lock:pinAttempts";
/** Earliest timestamp the next attempt is allowed (sessionStorage). */
const SS_PIN_LOCK_UNTIL = "splittrip:lock:pinLockUntil";

/** Grace period: if tab was hidden for less than this many ms, skip re-auth. */
export const RELOCK_GRACE_MS = 30_000;

export function isLockEnabled(): boolean {
  try { return localStorage.getItem(LS_ENABLED) === "1"; } catch { return false; }
}

export function getLockMode(): LockMode | null {
  try { return (localStorage.getItem(LS_MODE) as LockMode) || null; } catch { return null; }
}

export function isUnlockedThisSession(): boolean {
  try { return sessionStorage.getItem(SS_UNLOCKED) === "1"; } catch { return false; }
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(SS_UNLOCKED, "1");
    sessionStorage.removeItem(SS_HIDDEN_AT);
    sessionStorage.removeItem(SS_PIN_ATTEMPTS);
    sessionStorage.removeItem(SS_PIN_LOCK_UNTIL);
  } catch { /* noop */ }
}

export function lockNow(): void {
  try { sessionStorage.removeItem(SS_UNLOCKED); } catch { /* noop */ }
}

/** Record the moment the tab went into background — used for the grace period. */
export function markHidden(): void {
  try { sessionStorage.setItem(SS_HIDDEN_AT, String(Date.now())); } catch { /* noop */ }
}

/** True if the tab returned within RELOCK_GRACE_MS — skips re-auth prompt. */
export function isWithinGracePeriod(): boolean {
  try {
    const raw = sessionStorage.getItem(SS_HIDDEN_AT);
    if (!raw) return false;
    const hiddenAt = parseInt(raw, 10);
    if (!Number.isFinite(hiddenAt)) return false;
    return Date.now() - hiddenAt < RELOCK_GRACE_MS;
  } catch { return false; }
}

/* -------------------- PIN attempt rate limiting -------------------- */

export interface RateLimitState {
  attempts: number;
  /** Milliseconds until the next attempt is allowed; 0 if not throttled. */
  cooldownMs: number;
}

export function getPinRateLimit(): RateLimitState {
  try {
    const attempts = parseInt(sessionStorage.getItem(SS_PIN_ATTEMPTS) || "0", 10) || 0;
    const until = parseInt(sessionStorage.getItem(SS_PIN_LOCK_UNTIL) || "0", 10) || 0;
    const cooldownMs = Math.max(0, until - Date.now());
    return { attempts, cooldownMs };
  } catch { return { attempts: 0, cooldownMs: 0 }; }
}

function recordPinFailure(): RateLimitState {
  try {
    const attempts = (parseInt(sessionStorage.getItem(SS_PIN_ATTEMPTS) || "0", 10) || 0) + 1;
    sessionStorage.setItem(SS_PIN_ATTEMPTS, String(attempts));
    // Exponential back-off starting after 5 failed attempts:
    // attempt 6 = 5 s, 7 = 10 s, 8 = 20 s, 9 = 40 s, 10+ = 60 s (capped).
    let cooldownMs = 0;
    if (attempts >= 5) {
      const overflow = attempts - 5;
      cooldownMs = Math.min(60_000, 5_000 * Math.pow(2, overflow));
      sessionStorage.setItem(SS_PIN_LOCK_UNTIL, String(Date.now() + cooldownMs));
    }
    return { attempts, cooldownMs };
  } catch { return { attempts: 0, cooldownMs: 0 }; }
}

export function disableLock(): void {
  try {
    localStorage.removeItem(LS_ENABLED);
    localStorage.removeItem(LS_MODE);
    localStorage.removeItem(LS_HASH);
    localStorage.removeItem(LS_SALT);
    localStorage.removeItem(LS_CRED_ID);
    localStorage.removeItem(LS_RP_ID);
    sessionStorage.removeItem(SS_UNLOCKED);
  } catch { /* noop */ }
}

/* -------------------- Passcode (PBKDF2) -------------------- */

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPasscode(passcode: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  // Copy salt into a fresh ArrayBuffer to keep TypeScript happy
  // (avoids ArrayBufferLike vs ArrayBuffer mismatch with SharedArrayBuffer).
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 200_000, hash: "SHA-256" },
    keyMat,
    256,
  );
  return toB64(bits);
}

export async function setPasscode(passcode: string): Promise<void> {
  if (!/^\d{4,6}$/.test(passcode)) throw new Error("Passcode must be 4-6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasscode(passcode, salt);
  localStorage.setItem(LS_SALT, toB64(salt.buffer));
  localStorage.setItem(LS_HASH, hash);
  localStorage.setItem(LS_MODE, "passcode");
  localStorage.setItem(LS_ENABLED, "1");
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  // Honour rate limit if any cool-down is active.
  const rl = getPinRateLimit();
  if (rl.cooldownMs > 0) return false;
  const saltB64 = localStorage.getItem(LS_SALT);
  const expected = localStorage.getItem(LS_HASH);
  if (!saltB64 || !expected) return false;
  const salt = fromB64(saltB64);
  const actual = await hashPasscode(passcode, salt);
  // constant-time-ish compare
  let diff = actual.length === expected.length ? 0 : 1;
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  const ok = diff === 0;
  if (!ok) recordPinFailure();
  return ok;
}

/**
 * Add or replace a passcode while keeping the existing lock mode.
 * Used to register a passcode fallback alongside biometric.
 */
export async function setBackupPasscode(passcode: string): Promise<void> {
  if (!/^\d{4,6}$/.test(passcode)) throw new Error("Passcode must be 4-6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasscode(passcode, salt);
  localStorage.setItem(LS_SALT, toB64(salt.buffer));
  localStorage.setItem(LS_HASH, hash);
  // Do NOT touch LS_MODE / LS_ENABLED — biometric stays primary.
}

/** Remove only the passcode (does not disable biometric). */
export function removeBackupPasscode(): void {
  localStorage.removeItem(LS_SALT);
  localStorage.removeItem(LS_HASH);
}

/* -------------------- Biometric (WebAuthn) -------------------- */

export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false;
    const fn = (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== "function") return false;
    return await fn.call(PublicKeyCredential);
  } catch { return false; }
}

export async function registerBiometric(): Promise<void> {
  if (!(await isBiometricSupported())) throw new Error("Biometric not supported on this device");
  const rpId = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: "SplitTrip" },
      user: {
        id: userId,
        name: "splittrip-local",
        displayName: "SplitTrip",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  }) as PublicKeyCredential | null;

  if (!cred) throw new Error("Biometric registration cancelled");
  const credId = toB64(cred.rawId);
  localStorage.setItem(LS_CRED_ID, credId);
  localStorage.setItem(LS_RP_ID, rpId);
  localStorage.setItem(LS_MODE, "biometric");
  localStorage.setItem(LS_ENABLED, "1");
}

export async function verifyBiometric(): Promise<boolean> {
  const credIdB64 = localStorage.getItem(LS_CRED_ID);
  const rpId = localStorage.getItem(LS_RP_ID) || window.location.hostname;
  if (!credIdB64) return false;
  const credBytes = fromB64(credIdB64);
  const credId = new ArrayBuffer(credBytes.byteLength);
  new Uint8Array(credId).set(credBytes);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{ id: credId, type: "public-key", transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

/** True if a passcode is configured (used as biometric fallback). */
export function hasPasscodeFallback(): boolean {
  return !!localStorage.getItem(LS_HASH) && !!localStorage.getItem(LS_SALT);
}
