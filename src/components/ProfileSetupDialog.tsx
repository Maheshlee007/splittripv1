import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useApp } from "@/store/AppStore";
import { toast } from "sonner";
import { UserCircle2 } from "lucide-react";

export function ProfileSetupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const { profile, setProfileFields } = useApp();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [upi, setUpi] = useState(profile.upiId ?? "");

  useEffect(() => {
    if (open) {
      setName(profile.name);
      setPhone(profile.phone ?? "");
      setUpi(profile.upiId ?? "");
    }
  }, [open, profile]);

  const save = () => {
    if (!name.trim()) { toast.error("Display name is required"); return; }
    setProfileFields({ name: name.trim(), phone: phone.trim() || undefined, upiId: upi.trim() || undefined });
    toast.success("Profile saved");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle2 className="h-5 w-5 text-primary" /> Set up your profile
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tell us how others should see you. This is shared with your trip group when you create or join a trip.
          </p>
          <div>
            <Label>Display name *</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karthik" />
          </div>
          <div>
            <Label>Mobile number</Label>
            <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" />
          </div>
          <div>
            <Label>UPI ID (optional)</Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={!name.trim()} className="w-full">Save & continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
