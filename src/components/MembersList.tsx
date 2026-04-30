import { useState } from "react";
import { useApp } from "@/store/AppStore";
import { Group, Member } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Crown, Shield, User as UserIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function MembersList({ group }: { group: Group }) {
  const { addMember, removeMember, setRole, profile, myRole } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");

  const role = myRole(group.id);
  const canManage = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  const handleAdd = () => {
    if (!name.trim()) return;
    addMember(group.id, name, upi || undefined);
    setName(""); setUpi(""); setOpen(false);
    toast.success("Member added");
  };

  const cycleRole = (m: Member) => {
    if (!isOwner || m.id === group.ownerId) return;
    const next: Member["role"] = m.role === "member" ? "admin" : "member";
    setRole(group.id, m.id, next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Members ({group.members.length})</h3>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Riya" />
                </div>
                <div>
                  <Label>UPI ID (optional)</Label>
                  <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" />
                </div>
                <Button className="w-full" onClick={handleAdd} disabled={!name.trim()}>Add</Button>
                <p className="text-xs text-muted-foreground">
                  Or share the trip code so they can join from their own phone — that's the better option (their changes will sync live).
                </p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="rounded-xl border border-border">
        {group.members.map((m, idx) => {
          const isMe = m.id === profile.id;
          const isGroupOwner = m.id === group.ownerId;
          return (
            <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? "border-t border-border" : ""}`}>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {isMe && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">you</span>}
                </div>
                {m.upiId && <div className="truncate text-xs text-muted-foreground">{m.upiId}</div>}
              </div>
              <button
                onClick={() => cycleRole(m)}
                disabled={!isOwner || isGroupOwner}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${
                  isGroupOwner
                    ? "bg-warning/15 text-warning"
                    : m.role === "admin"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground"
                } ${isOwner && !isGroupOwner ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              >
                {isGroupOwner ? <Crown className="h-3 w-3" /> : m.role === "admin" ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                {isGroupOwner ? "owner" : m.role}
              </button>
              {canManage && !isMe && !isGroupOwner && (
                <button
                  onClick={() => {
                    if (confirm(`Remove ${m.name}?`)) removeMember(group.id, m.id);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
