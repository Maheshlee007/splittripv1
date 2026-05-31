import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, Pencil, User, Phone, AtSign, CheckCircle2, Download, Upload, ShieldAlert, BookOpen, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { downloadBackup, restoreBackup } from "@/lib/backup";
import { toast } from "sonner";
import {
  isLockEnabled,
  getLockMode,
  disableLock,
  setPasscode,
  setBackupPasscode,
  removeBackupPasscode,
  registerBiometric,
  isBiometricSupported,
  verifyPasscode,
  verifyBiometric,
  hasPasscodeFallback,
  type LockMode,
} from "@/lib/app-lock";
import { useAppLock } from "@/components/AppLock";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function MePage() {
  const { profile, setProfileFields, themePref, setThemePref } = useApp();
  const [editing, setEditing] = useState(!profile.name);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [upi, setUpi] = useState(profile.upiId ?? "");
  const [launchMode, setLaunchMode] = useState<"group" | "personal">(
    () => (localStorage.getItem("splittrip:default-mode") as "group" | "personal") || "group"
  );

  useEffect(() => {
    setName(profile.name);
    setPhone(profile.phone ?? "");
    setUpi(profile.upiId ?? "");
  }, [profile]);

  const saveLaunchMode = (mode: "group" | "personal") => {
    setLaunchMode(mode);
    localStorage.setItem("splittrip:default-mode", mode);
    toast.success(`Default launch set to ${mode}`);
  };

  const save = () => {
    if (!name.trim()) { toast.error("Display name is required"); return; }
    setProfileFields({ name: name.trim(), phone: phone.trim() || undefined, upiId: upi.trim() || undefined });
    toast.success("Profile saved");
    setEditing(false);
  };

  return (
    <>
      <PageHeader title="Me" subtitle="Your profile & preferences" />
      <div className="mx-auto max-w-5xl px-4 py-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start space-y-4 lg:space-y-0">
        {/* Left column: Profile + Lock */}
        <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Profile</h3>
            {!editing && profile.name && (
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>

          {editing ? (
            <>
              <div>
                <Label>Display name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="How others see you" autoFocus />
              </div>
              <div>
                <Label>Mobile number</Label>
                <Input
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                />
              </div>
              <div>
                <Label>UPI ID (for receiving settlements)</Label>
                <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" />
                <p className="mt-1 text-xs text-muted-foreground">
                  When others tap "Pay", their UPI app opens with your VPA pre-filled.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={save} className="flex-1">{profile.name ? "Update" : "Save profile"}</Button>
                {profile.name && (
                  <Button variant="ghost" onClick={() => { setEditing(false); setName(profile.name); setPhone(profile.phone ?? ""); setUpi(profile.upiId ?? ""); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <ViewRow icon={<User className="h-4 w-4" />} label="Display name" value={profile.name || "—"} />
              <ViewRow icon={<Phone className="h-4 w-4" />} label="Mobile" value={profile.phone || "—"} />
              <ViewRow icon={<AtSign className="h-4 w-4" />} label="UPI ID" value={profile.upiId || "—"} />
              {profile.name && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Profile is set up
                </p>
              )}
            </div>
          )}
        </section>

        <LockSection />
        </div>

        {/* Right column: Appearance + Backup + Help */}
        <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "light", icon: Sun, label: "Light" },
              { id: "dark", icon: Moon, label: "Dark" },
              { id: "system", icon: Monitor, label: "System" },
            ] as const).map((o) => {
              const Icon = o.icon;
              const active = themePref === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => setThemePref(o.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition ${
                    active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Light = orange accent · Dark = radium-green accent · System follows your device.
          </p>

          <div className="pt-2 border-t border-border/60">
            <Label className="text-xs">Default launch mode</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => saveLaunchMode("group")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${launchMode === "group" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                Group
              </button>
              <button
                onClick={() => saveLaunchMode("personal")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${launchMode === "personal" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                Personal
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Used when the app opens at root route.</p>
          </div>
        </section>

        <BackupSection />

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">Help</h3>
          <p className="text-xs text-muted-foreground">Quick setup, peer connection flow, and troubleshooting.</p>
          <Button asChild variant="secondary" className="gap-1.5">
            <Link to="/how-to">
              <BookOpen className="h-4 w-4" /> How to Use
            </Link>
          </Button>
        </section>
        </div>

        {/* Full-width About section below both columns */}
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card lg:col-span-2">
          <h3 className="text-sm font-semibold">About SplitTrip</h3>
          <p className="text-xs text-muted-foreground">
            Local-first, peer-to-peer expense tracking. No backend, no accounts. Your data stays on your device (IndexedDB + localStorage fallback) and syncs directly with other members via WebRTC when you're online.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: install this app to your home screen for the best experience.
          </p>
        </section>
      </div>
    </>
  );
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const handleFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await restoreBackup(f);
      const parts = [
        `${r.groups} trip${r.groups === 1 ? "" : "s"}`,
        `${r.personalExpenses} personal expense${r.personalExpenses === 1 ? "" : "s"}`,
        `${r.lendings} lending${r.lendings === 1 ? "" : "s"}`,
      ];
      if (r.personalBudgets) parts.push(`${r.personalBudgets} budget${r.personalBudgets === 1 ? "" : "s"}`);
      if (r.paymentMethods) parts.push(`${r.paymentMethods} payment method${r.paymentMethods === 1 ? "" : "s"}`);
      toast.success(`Restored ${parts.join(" + ")}. Refreshing…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast.error(e?.message || "Restore failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backup &amp; restore</h3>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Take a JSON backup before clearing data or switching browsers.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => downloadBackup()} disabled={busy} className="gap-1.5">
          <Download className="h-4 w-4" /> Export all
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-1.5">
          <Upload className="h-4 w-4" /> Restore
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Backup includes your profile + every trip (members, expenses, requests, settlements, bill photos) + personal expenses, budgets, payment methods and lendings.
      </p>
    </section>
  );
}

function LockSection() {
  const { refresh } = useAppLock();
  const [enabled, setEnabled] = useState<boolean>(() => isLockEnabled());
  const [mode, setMode] = useState<LockMode | null>(() => getLockMode());
  const [bioSupported, setBioSupported] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupKind, setSetupKind] = useState<"primary" | "backup">("primary");
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePin, setDisablePin] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);

  useEffect(() => {
    isBiometricSupported().then(setBioSupported);
    setHasBackup(hasPasscodeFallback());
  }, [enabled, mode]);

  const reload = () => {
    setEnabled(isLockEnabled());
    setMode(getLockMode());
    setHasBackup(hasPasscodeFallback());
    refresh();
  };

  const handleDisable = async () => {
    // Require verification before disabling.
    try {
      if (mode === "biometric") {
        const ok = await verifyBiometric();
        if (!ok) { toast.error("Authentication failed"); return; }
        disableLock();
        reload();
        toast.success("App lock disabled");
        return;
      }
      if (mode === "passcode") {
        // Open custom dialog for consistent UI (no native browser prompt).
        setDisablePin("");
        setDisableOpen(true);
        return;
      }
      disableLock();
      reload();
      toast.success("App lock disabled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to disable lock");
    }
  };

  const confirmDisableWithPasscode = async () => {
    if (busy) return;
    if (!/^\d{4,6}$/.test(disablePin)) { toast.error("Enter 4-6 digits"); return; }
    setBusy(true);
    try {
      const ok = await verifyPasscode(disablePin);
      if (!ok) { toast.error("Incorrect passcode"); setDisablePin(""); return; }
      disableLock();
      reload();
      setDisableOpen(false);
      setDisablePin("");
      toast.success("App lock disabled");
    } finally {
      setBusy(false);
    }
  };

  const handleEnableBiometric = async () => {
    setBusy(true);
    try {
      await registerBiometric();
      toast.success("Biometric lock enabled");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't register biometric — try passcode instead");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPasscode = async () => {
    if (pin !== pin2) { toast.error("Passcodes don't match"); return; }
    setBusy(true);
    try {
      if (setupKind === "backup") {
        await setBackupPasscode(pin);
        toast.success("Backup passcode set");
      } else {
        await setPasscode(pin);
        toast.success("Passcode lock enabled");
      }
      setPin(""); setPin2(""); setSetupOpen(false);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't set passcode");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveBackup = () => {
    removeBackupPasscode();
    reload();
    toast.success("Backup passcode removed");
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" /> App lock
        </h3>
        {enabled && (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
            {mode === "biometric" ? "Biometric" : "Passcode"} on
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Require authentication every time the app is opened, switched to, or restored from background.
      </p>

      {enabled ? (
        <div className="space-y-2">
          <Button variant="destructive" className="w-full gap-2" onClick={handleDisable}>
            <Lock className="h-4 w-4" /> Disable app lock
          </Button>
          {mode === "biometric" && (
            <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium">Backup passcode</p>
                  <p className="text-[10px] text-muted-foreground">
                    {hasBackup ? "Used if biometric fails or is unavailable." : "Recommended in case biometric stops working."}
                  </p>
                </div>
                {hasBackup ? (
                  <Button size="sm" variant="ghost" onClick={handleRemoveBackup}>
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => { setSetupKind("backup"); setSetupOpen(true); }}>
                    <Lock className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {bioSupported && (
            <Button onClick={handleEnableBiometric} disabled={busy} className="gap-2">
              <Fingerprint className="h-4 w-4" />
              Enable biometric
            </Button>
          )}
          <Button variant={bioSupported ? "secondary" : "default"} onClick={() => { setSetupKind("primary"); setSetupOpen(true); }} disabled={busy} className="gap-2">
            <Lock className="h-4 w-4" /> Use passcode
          </Button>
        </div>
      )}
      {!enabled && !bioSupported && (
        <p className="text-[10px] text-muted-foreground">
          Biometric not available on this device — passcode only.
        </p>
      )}

      {/* Passcode setup dialog (used for primary passcode and backup passcode) */}
      <Dialog open={setupOpen} onOpenChange={(v) => { if (!busy) { setSetupOpen(v); if (!v) { setPin(""); setPin2(""); } } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {setupKind === "backup" ? "Set backup passcode" : "Set passcode"}
            </DialogTitle>
            <DialogDescription>
              {setupKind === "backup"
                ? "Used if biometric fails or is unavailable on this device."
                : "Enter a 4-6 digit passcode. It is hashed locally and never leaves your device."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              className="text-center text-lg tracking-[0.5em]"
            />
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="confirm"
              className="text-center text-lg tracking-[0.5em]"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSetPasscode(); }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => { setSetupOpen(false); setPin(""); setPin2(""); }} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSetPasscode} disabled={busy || pin.length < 4}>
              {busy ? "Saving…" : setupKind === "backup" ? "Set backup" : "Set passcode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom passcode dialog for disabling lock (replaces window.prompt) */}
      <Dialog open={disableOpen} onOpenChange={(v) => { if (!busy) { setDisableOpen(v); if (!v) setDisablePin(""); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Confirm passcode
            </DialogTitle>
            <DialogDescription>
              Enter your current passcode to disable the app lock.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={disablePin}
            onChange={(e) => setDisablePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmDisableWithPasscode(); }}
            placeholder="••••"
            className="text-center text-lg tracking-[0.6em]"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => { setDisableOpen(false); setDisablePin(""); }} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDisableWithPasscode} disabled={busy || disablePin.length < 4}>
              {busy ? "Verifying…" : "Disable lock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ViewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-background text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
