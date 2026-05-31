import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  isLockEnabled,
  getLockMode,
  isUnlockedThisSession,
  markUnlocked,
  lockNow,
  verifyBiometric,
  verifyPasscode,
  hasPasscodeFallback,
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

  // Re-lock when tab is hidden for the duration of the hidden period.
  // Any return from background (visibilitychange / pageshow) requires re-auth.
  useEffect(() => {
    if (!isLockEnabled()) return;
    const onHide = () => {
      lockNow();
      setLocked(true);
    };
    const onShow = () => {
      // Already unlocked this tab session? then keep open (markUnlocked was called).
      setLocked(computeLocked());
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
      else onShow();
    });
    window.addEventListener("pageshow", onShow);
    window.addEventListener("pagehide", onHide);
    return () => {
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
  const triedBiometricRef = useRef(false);

  const tryBiometric = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyBiometric();
      if (ok) onUnlocked();
      else setError("Biometric failed. Try again or use passcode.");
    } catch (e: any) {
      setError(e?.message || "Biometric failed.");
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
    if (!/^\d{4,6}$/.test(pin)) { setError("Enter 4-6 digits"); return; }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyPasscode(pin);
      if (ok) onUnlocked();
      else { setError("Incorrect passcode"); setPin(""); }
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
            <Button onClick={submitPin} disabled={busy || pin.length < 4} className="w-full">
              {busy ? "Verifying…" : "Unlock"}
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
