import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  isLockEnabled,
  getLockMode,
  isUnlockedThisSession,
  markUnlocked,
  lockNow,
  markHidden,
  isWithinGracePeriod,
  verifyBiometric,
  verifyPasscode,
  hasPasscodeFallback,
  getPinRateLimit,
  type LockMode,
} from "@/lib/app-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface LockCtx {
  locked: boolean;
  /** Re-evaluate lock state (call after enabling/disabling in settings). */
  refresh: () => void;
}

const Ctx = createContext<LockCtx>({ locked: false, refresh: () => {} });
export const useAppLock = () => useContext(Ctx);

function computeLocked(): boolean {
  return isLockEnabled() && !isUnlockedThisSession();
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState<boolean>(() => computeLocked());

  const refresh = useCallback(() => {
    setLocked(computeLocked());
  }, []);

  // Re-lock when tab is hidden long enough. A short grace period (30s)
  // skips re-auth for quick app switches so the UX isn't punishing.
  useEffect(() => {
    if (!isLockEnabled()) return;
    const onHide = () => {
      markHidden();
    };
    const onShow = () => {
      if (isWithinGracePeriod()) {
        // Stayed away briefly — keep unlocked, no prompt.
        return;
      }
      lockNow();
      setLocked(computeLocked());
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
      else onShow();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Sync across tabs when lock is enabled/disabled from settings.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("splittrip:lock:")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const handleUnlocked = useCallback(() => {
    markUnlocked();
    setLocked(false);
  }, []);

  return (
    <Ctx.Provider value={{ locked, refresh }}>
      {locked ? <LockScreen onUnlocked={handleUnlocked} /> : children}
    </Ctx.Provider>
  );
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const mode = (getLockMode() ?? "passcode") as LockMode;
  const [usePasscode, setUsePasscode] = useState<boolean>(mode === "passcode");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const triedBiometricRef = useRef(false);

  // Tick cool-down timer.
  useEffect(() => {
    const tick = () => {
      const rl = getPinRateLimit();
      setCooldown(rl.cooldownMs);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [error]);

  const tryBiometric = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyBiometric();
      if (ok) onUnlocked();
      else {
        // Auto-switch to passcode if a fallback exists.
        if (hasPasscodeFallback()) {
          setUsePasscode(true);
          setError("Biometric failed — enter your passcode instead.");
        } else {
          setError("Biometric failed. Try again.");
        }
      }
    } catch (e: any) {
      if (hasPasscodeFallback()) {
        setUsePasscode(true);
        setError("Biometric unavailable — enter your passcode.");
      } else {
        setError(e?.message || "Biometric failed.");
      }
    } finally {
      setBusy(false);
    }
  }, [onUnlocked]);

  // Auto-prompt biometric once on mount when in biometric mode.
  useEffect(() => {
    if (mode !== "biometric" || triedBiometricRef.current) return;
    triedBiometricRef.current = true;
    void tryBiometric();
  }, [mode, tryBiometric]);

  const submitPin = async () => {
    if (busy) return;
    if (cooldown > 0) return;
    if (!/^\d{4,6}$/.test(pin)) { setError("Enter 4-6 digits"); return; }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyPasscode(pin);
      if (ok) onUnlocked();
      else {
        const rl = getPinRateLimit();
        setCooldown(rl.cooldownMs);
        setPin("");
        if (rl.cooldownMs > 0) {
          setError(`Too many wrong attempts. Try again in ${Math.ceil(rl.cooldownMs / 1000)}s.`);
        } else {
          setError(`Incorrect passcode${rl.attempts >= 3 ? ` (${rl.attempts} failed)` : ""}`);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const canUseBiometric = mode === "biometric";
  const canUsePasscodeFallback = mode === "passcode" || hasPasscodeFallback();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">SplitTrip is locked</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {canUseBiometric && !usePasscode
              ? "Authenticate to continue"
              : "Enter your passcode to continue"}
          </p>
        </div>

        {canUseBiometric && !usePasscode ? (
          <div className="flex flex-col gap-2">
            <Button onClick={tryBiometric} disabled={busy} className="w-full gap-2">
              <Fingerprint className="h-4 w-4" />
              {busy ? "Waiting…" : "Use biometric"}
            </Button>
            {canUsePasscodeFallback && (
              <Button variant="ghost" className="w-full gap-2" onClick={() => { setUsePasscode(true); setError(null); }}>
                <Lock className="h-4 w-4" /> Use passcode
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") void submitPin(); }}
              placeholder="••••"
              className={cn("text-center text-lg tracking-[0.6em]", error && "border-destructive")}
            />
            <Button onClick={submitPin} disabled={busy || pin.length < 4 || cooldown > 0} className="w-full">
              {busy ? "Verifying…" : cooldown > 0 ? `Wait ${Math.ceil(cooldown / 1000)}s` : "Unlock"}
            </Button>
            {canUseBiometric && (
              <Button variant="ghost" className="w-full gap-2" onClick={() => { setUsePasscode(false); setError(null); void tryBiometric(); }}>
                <Fingerprint className="h-4 w-4" /> Use biometric
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-center text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
