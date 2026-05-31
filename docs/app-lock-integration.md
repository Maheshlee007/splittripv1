# App Lock — Biometric & Passcode Integration Guide

A drop-in, **library-free** app-lock system for web apps and PWAs that supports:

- **Native biometric** via [WebAuthn](https://www.w3.org/TR/webauthn-2/) platform authenticators (Touch ID / Face ID / Windows Hello / Android fingerprint)
- **4–6 digit passcode** fallback (PBKDF2-SHA256, 200k iterations)
- Re-lock on tab hide / pagehide / app background
- Cross-tab sync via the `storage` event
- Everything stored locally — no server, no third-party SDK

> Works in any React app. Adapt the React provider for Vue / Svelte / vanilla JS — the core (`lib/app-lock.ts`) is framework-agnostic.

---

## 1. How it works

### Biometric (WebAuthn platform authenticator)

```
┌──────────────┐   register()    ┌─────────────────────┐
│  Your app    │ ──────────────▶ │  Platform           │
│  (browser)   │                 │  authenticator      │
│              │ ◀────────────── │  (TPM / Secure      │
│              │   credentialId  │   Enclave / TEE)    │
└──────────────┘                 └─────────────────────┘
       │
       │ store credentialId in localStorage (NOT a secret)
       ▼
┌──────────────┐
│ localStorage │
└──────────────┘
```

- The **private key never leaves the device**. The OS keychain holds it inside hardware (Secure Enclave / TPM / StrongBox).
- We use a `userVerification: "required"` assertion — the OS asks the user for Face ID / fingerprint / PIN before signing.
- We don't need a server: we just need to know that the OS authenticated *someone* before letting them in.
- The `credentialId` we store in `localStorage` is **not secret** — losing it just means re-enrollment.

### Passcode

- User picks a 4–6 digit PIN.
- A random 16-byte salt is generated.
- We derive a 256-bit key using `PBKDF2-SHA256` with 200,000 iterations.
- Only the **base64 hash + salt** are persisted. The raw PIN is never stored.
- On unlock we re-derive and compare in constant time.

### Session model

- Unlock state lives in `sessionStorage` (cleared when the tab closes).
- On every `visibilitychange` → `hidden`, or `pagehide`, we wipe the session flag → next focus requires re-auth.
- Multiple tabs sync via the `storage` event: enabling lock in one tab locks the others on next focus.

---

## 2. Requirements

| Requirement                       | Why                                                                |
| --------------------------------- | ------------------------------------------------------------------ |
| **HTTPS or `localhost`**          | WebAuthn + Web Crypto are gated to secure contexts                 |
| `crypto.subtle` available         | For PBKDF2 (every modern browser supports it)                      |
| `PublicKeyCredential` (biometric) | Chrome 67+, Safari 14+, Firefox 60+, Edge 18+                      |
| `isUserVerifyingPlatformAuthenticatorAvailable()` returns `true` | Device must have Touch ID / Face ID / Windows Hello / fingerprint  |
| A stable **RP ID** (hostname)     | The same effective domain must be used for register + assert       |

### When biometric is **not** available

The library auto-detects via `isBiometricSupported()` and the UI falls back to passcode. The two are independent — you can have only a passcode, only a biometric, or both (biometric primary, passcode as fallback if biometric fails).

---

## 3. Files in this repo

```
src/lib/app-lock.ts         # core: register/verify, storage, no React
src/components/AppLock.tsx  # React provider + LockScreen UI
```

Copy these two files into your project. They have **zero dependencies** other than React (for the provider) and your UI kit.

---

## 4. The core API (`lib/app-lock.ts`)

```ts
// State
export function isLockEnabled(): boolean;
export function getLockMode(): "biometric" | "passcode" | null;
export function isUnlockedThisSession(): boolean;
export function markUnlocked(): void;
export function lockNow(): void;
export function disableLock(): void;

// Passcode
export async function setPasscode(passcode: string): Promise<void>; // 4–6 digits
export async function verifyPasscode(passcode: string): Promise<boolean>;

// Biometric (WebAuthn)
export async function isBiometricSupported(): Promise<boolean>;
export async function registerBiometric(): Promise<void>;
export async function verifyBiometric(): Promise<boolean>;

// Helper
export function hasPasscodeFallback(): boolean;
```

### Storage keys (localStorage)

| Key                          | Value                                  |
| ---------------------------- | -------------------------------------- |
| `splittrip:lock:enabled`     | `"1"` when lock is on                  |
| `splittrip:lock:mode`        | `"biometric"` or `"passcode"`          |
| `splittrip:lock:salt`        | base64 16-byte PBKDF2 salt             |
| `splittrip:lock:hash`        | base64 256-bit PBKDF2 hash             |
| `splittrip:lock:credId`      | base64 WebAuthn `rawId`                |
| `splittrip:lock:rpId`        | hostname used during registration      |
| `splittrip:lock:unlocked` (sessionStorage) | `"1"` when this tab is unlocked        |

> Rename the prefix (`splittrip:lock:`) to match your app.

---

## 5. Key code — annotated

### 5.1 Biometric registration

```ts
export async function registerBiometric(): Promise<void> {
  if (!(await isBiometricSupported())) throw new Error("Biometric not supported");
  const rpId = window.location.hostname;        // must match on verify
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16)); // ephemeral

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: "YourApp" },
      user: { id: userId, name: "local", displayName: "YourApp" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256 (preferred)
        { type: "public-key", alg: -257 }, // RS256 (fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",   // device-bound only
        userVerification: "required",          // force biometric/PIN gesture
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",                     // we don't need attestation
    },
  }) as PublicKeyCredential | null;

  if (!cred) throw new Error("Cancelled");
  localStorage.setItem(LS_CRED_ID, toB64(cred.rawId));
  localStorage.setItem(LS_RP_ID, rpId);
  localStorage.setItem(LS_MODE, "biometric");
  localStorage.setItem(LS_ENABLED, "1");
}
```

**Why these options?**

- `authenticatorAttachment: "platform"` → only the device's built-in authenticator (no roaming keys / security keys).
- `userVerification: "required"` → forces an actual gesture (Face ID, fingerprint, Windows Hello PIN). Without this the OS may silently approve.
- `attestation: "none"` → we're a local-only app, we don't need to prove the authenticator's make/model.
- `residentKey: "preferred"` → allows passkey-style discovery, but we keep the credentialId anyway for compatibility.

### 5.2 Biometric verification

```ts
export async function verifyBiometric(): Promise<boolean> {
  const credIdB64 = localStorage.getItem(LS_CRED_ID);
  const rpId = localStorage.getItem(LS_RP_ID) || window.location.hostname;
  if (!credIdB64) return false;

  // Decode and copy into a fresh ArrayBuffer (TypeScript-friendly)
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
    return false;   // user cancelled / failed biometric
  }
}
```

We don't validate the signature server-side because there is no server. The OS-mediated gesture is the security boundary. If your app **does** have a backend, send the assertion + challenge + clientDataJSON to it and verify with a server library (`@simplewebauthn/server`, `fido2-lib`, etc.).

### 5.3 Passcode hashing

```ts
async function hashPasscode(passcode: string, salt: Uint8Array): Promise<string> {
  const keyMat = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passcode),
    { name: "PBKDF2" }, false, ["deriveBits"],
  );
  // Copy salt into a fresh ArrayBuffer to satisfy strict TS types
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 200_000, hash: "SHA-256" },
    keyMat, 256,
  );
  return toB64(bits);
}
```

**Tunables:**

- `iterations: 200_000` — adjust to ~250 ms on a mid-range phone. Higher = stronger but slower unlock.
- `hash: "SHA-256"` — universally supported, fine for 4–6 digit secrets.
- Use **constant-time comparison** when checking (XOR all bytes, OR the diff):

```ts
if (actual.length !== expected.length) return false;
let diff = 0;
for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
return diff === 0;
```

> A 4-digit PIN has only 10,000 possibilities. PBKDF2 raises the cost of each guess to ~250 ms × 10,000 ≈ 40 minutes, which is enough to deter a casual attacker but **not** a sophisticated one with the localStorage hash. If you need stronger guarantees, use a longer passphrase or biometric.

---

## 6. React integration (`components/AppLock.tsx`)

### Provider

```tsx
import { AppLockProvider } from "./components/AppLock";

function App() {
  return (
    <AppLockProvider>
      <YourRoutes />
    </AppLockProvider>
  );
}
```

Place it **outside** your router so the lock screen replaces the entire UI when locked.

### Re-lock on background

```ts
useEffect(() => {
  if (!isLockEnabled()) return;
  const onHide = () => { lockNow(); setLocked(true); };
  const onShow = () => setLocked(computeLocked());
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "hidden" ? onHide() : onShow();
  });
  window.addEventListener("pageshow", onShow);
  window.addEventListener("pagehide", onHide);
  return () => { /* cleanup */ };
}, []);
```

Catches:

- Tab switch / window switch (`visibilitychange`)
- PWA backgrounded on mobile (`pagehide`)
- Browser cache restore / bfcache (`pageshow`)
- Page reload (sessionStorage already cleared)

### Cross-tab sync

```ts
useEffect(() => {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("splittrip:lock:")) refresh();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}, [refresh]);
```

### Auto-prompt biometric on mount

```ts
const triedRef = useRef(false);
useEffect(() => {
  if (mode !== "biometric" || triedRef.current) return;
  triedRef.current = true;
  void tryBiometric();      // shows Touch ID / Face ID sheet
}, [mode]);
```

---

## 7. Settings UI (enable / disable)

```tsx
// Enable biometric
<Button onClick={async () => {
  try {
    await registerBiometric();
    toast.success("Biometric lock enabled");
  } catch (e) {
    toast.error(e.message);  // user cancelled or unsupported
  }
}}>
  Enable biometric
</Button>

// Enable passcode
<Button onClick={async () => {
  if (pin !== pin2) return toast.error("Passcodes don't match");
  await setPasscode(pin);
  toast.success("Passcode enabled");
}}>
  Set passcode
</Button>

// Disable — REQUIRE verification first
<Button variant="destructive" onClick={async () => {
  const mode = getLockMode();
  if (mode === "biometric") {
    if (!(await verifyBiometric())) return toast.error("Auth failed");
  } else if (mode === "passcode") {
    const pin = window.prompt("Enter current passcode:");
    if (!pin || !(await verifyPasscode(pin))) return toast.error("Wrong PIN");
  }
  disableLock();
}}>
  Disable lock
</Button>
```

---

## 8. Common pitfalls

| Pitfall | Fix |
| ------- | --- |
| `NotAllowedError` on `credentials.create/get` | Must be called from a **user gesture** (button click), not on mount. Auto-prompt only after a click. |
| `SecurityError: The relying party ID is not a registrable domain suffix` | `rp.id` must equal `window.location.hostname` (or a parent domain). `localhost` is allowed in dev. |
| `isUserVerifyingPlatformAuthenticatorAvailable()` returns `false` | Device has no biometric configured. Fall back to passcode. |
| WebAuthn works in dev but not prod | Probably mixed origins. The RP ID stored at registration must match the verify-time hostname. Re-enroll after domain change. |
| iOS Safari standalone PWA loses credential | Apple isolates WebAuthn per browsing context. Register **inside** the installed PWA, not in mobile Safari. |
| `ArrayBufferLike` vs `ArrayBuffer` TS errors | Copy into a fresh `ArrayBuffer` (see code samples above). Don't pass `Uint8Array.buffer` directly to WebCrypto/WebAuthn. |
| Lock screen flashes briefly on every navigation | Mount the provider **above** the router, not per-route. |
| User clears site data → lock disappears | Expected. Don't rely on the lock for secrets-at-rest; encrypt the actual data with a key derived from the passcode if you need that. |
| `crypto.subtle` is `undefined` | You're on `http://` or `file://`. Use HTTPS or `localhost`. |

---

## 9. Security model — what this **does not** protect

- **Data at rest.** If an attacker has the device unlocked and DevTools open, they can read your IndexedDB / localStorage directly. The lock only gates the UI.
- **Reverse engineering.** A determined attacker can pull the PBKDF2 hash and brute force a 4-digit PIN offline (~minutes on a GPU).
- **OS compromise.** A jailbroken / rooted device can intercept WebAuthn assertions.

If you need to protect actual secrets:

1. Don't store them in plaintext.
2. Derive a symmetric key from the passcode (`PBKDF2 → AES-GCM`) and encrypt data with it.
3. For biometric, use WebAuthn's `largeBlob` extension (Chrome 105+) to seal a key inside the authenticator, or fall back to wrapping the data key with a passcode-derived key.

---

## 10. Quick adapt for another framework

The core (`lib/app-lock.ts`) has no React deps. Replace the provider with:

### Vue 3

```ts
const locked = ref(isLockEnabled() && !isUnlockedThisSession());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { lockNow(); locked.value = true; }
});
```

### Vanilla JS

```js
function gate() {
  if (isLockEnabled() && !isUnlockedThisSession()) {
    document.body.innerHTML = `<lock-screen></lock-screen>`;
  }
}
gate();
document.addEventListener("visibilitychange", gate);
```

---

## 11. Testing checklist

- [ ] Enable biometric → close tab → reopen → must re-auth.
- [ ] Enable passcode → switch to another app → return → must re-auth.
- [ ] Wrong PIN 5 times → still works (no lockout by default; add one if needed).
- [ ] Disable lock requires verification.
- [ ] Refresh page while locked → still locked.
- [ ] Open two tabs → enable lock in tab A → tab B re-locks on focus.
- [ ] Install as PWA → biometric still triggers Touch ID sheet.
- [ ] Device with no biometric → only passcode option appears.

---

## 12. Production hardening (recommended additions)

- **Rate limit** PIN attempts: after 5 failures, exponential back-off using `setTimeout` and a counter in `sessionStorage`.
- **Auto-wipe**: after N failures, call `disableLock()` and clear app data (only for very sensitive apps).
- **Grace period**: skip re-auth if the tab was hidden for < N seconds (compare `Date.now()` on hide/show).
- **Recovery code**: generate a 12-word recovery phrase at setup; allow disabling lock with it if biometric + passcode are both lost.
- **iOS install prompt**: WebAuthn behaves better inside the standalone PWA than in mobile Safari — guide users to install first.

---

That's it. The whole thing is ~200 lines of code and works in every modern browser. Copy `lib/app-lock.ts` + `components/AppLock.tsx`, drop the provider above your routes, add the settings UI — done.
