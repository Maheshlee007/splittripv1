import { useState, useEffect } from "react";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Github } from "lucide-react";
import { toast } from "sonner";

export default function MePage() {
  const { profile, setProfileFields, theme, toggleTheme } = useApp();
  const [name, setName] = useState(profile.name);
  const [upi, setUpi] = useState(profile.upiId ?? "");

  useEffect(() => { setName(profile.name); setUpi(profile.upiId ?? ""); }, [profile]);

  const save = () => {
    setProfileFields({ name: name.trim(), upiId: upi.trim() || undefined });
    toast.success("Profile saved");
  };

  return (
    <>
      <PageHeader title="Me" subtitle="Your profile & preferences" />
      <div className="mx-auto max-w-xl space-y-6 px-4 py-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">Profile</h3>
          <div>
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <Label>UPI ID (for receiving settlements)</Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" />
            <p className="mt-1 text-xs text-muted-foreground">
              When other members tap "Pay" on a balance owed to you, their UPI app opens with your VPA pre-filled.
            </p>
          </div>
          <Button onClick={save}>Save profile</Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">{theme === "light" ? "Light · orange accent" : "Dark · radium-green accent"}</p>
            </div>
            <Button variant="secondary" onClick={toggleTheme} className="gap-2">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {theme === "light" ? "Dark" : "Light"}
            </Button>
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">About SplitTrip</h3>
          <p className="text-xs text-muted-foreground">
            Local-first, peer-to-peer expense tracking. No backend, no accounts. Your data stays on your device and syncs directly with other members via WebRTC when you're online.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: install this app to your home screen for the best experience (Share → Add to Home Screen on iPhone, install icon in the address bar on Android/desktop).
          </p>
        </section>
      </div>
    </>
  );
}
