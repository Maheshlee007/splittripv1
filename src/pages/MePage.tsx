import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, Pencil, User, Phone, AtSign, CheckCircle2, Download, Upload, ShieldAlert } from "lucide-react";
import { downloadBackup, restoreBackup } from "@/lib/backup";
import { toast } from "sonner";

export default function MePage() {
  const { profile, setProfileFields, themePref, setThemePref } = useApp();
  const [editing, setEditing] = useState(!profile.name);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [upi, setUpi] = useState(profile.upiId ?? "");

  useEffect(() => {
    setName(profile.name);
    setPhone(profile.phone ?? "");
    setUpi(profile.upiId ?? "");
  }, [profile]);

  const save = () => {
    if (!name.trim()) { toast.error("Display name is required"); return; }
    setProfileFields({ name: name.trim(), phone: phone.trim() || undefined, upiId: upi.trim() || undefined });
    toast.success("Profile saved");
    setEditing(false);
  };

  return (
    <>
      <PageHeader title="Me" subtitle="Your profile & preferences" />
      <div className="mx-auto max-w-xl space-y-6 px-4 py-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card">
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

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card">
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
        </section>

        <BackupSection />

        <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-card">
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
      toast.success(`Restored ${r.groups} trip${r.groups === 1 ? "" : "s"}. Refresh to see them.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast.error(e?.message || "Restore failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backup &amp; restore</h3>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Take a JSON backup before clearing app data, uninstalling, or switching browsers — local-first means data lives only on this device.
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
        Backup includes your profile + every trip (members, expenses, requests, settlements, bill photos).
      </p>
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
