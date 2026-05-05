import { useState } from "react";
import { useApp } from "@/store/AppStore";
import { Group, Member } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Crown, Shield, User as UserIcon, Trash2, Check, X, Clock } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "sonner";

export function MembersList({ group }: { group: Group }) {
  const { addMember, removeMember, setRole, profile, myRole, approveMember, rejectMember, requestLeave, clearLeaveRequest } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [upi, setUpi] = useState("");

  const role = myRole(group.id);
  const canManage = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  const handleAdd = () => {
    if (!name.trim()) return;
    addMember(group.id, name, upi || undefined, phone || undefined);
    setName(""); setPhone(""); setUpi(""); setOpen(false);
    toast.success("Member added");
  };

  const cycleRole = (m: Member) => {
    if (!isOwner || m.id === group.ownerId) return;
    const next: Member["role"] = m.role === "member" ? "admin" : "member";
    setRole(group.id, m.id, next);
    toast.success(`${m.name} is now ${next}`);
  };

  const pending = group.members.filter((m) => m.status === "pending");
  const active = group.members.filter((m) => m.status !== "pending");

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-warning/30 bg-warning/5 p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Clock className="h-4 w-4" /> Pending join requests ({pending.length})
          </h3>
          {pending.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-card p-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                {m.phone && <div className="truncate text-xs text-muted-foreground">{m.phone}</div>}
              </div>
              {isOwner ? (
                <>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={async () => {
                    const ok = await confirm({ title: `Reject ${m.name}?`, description: "They won't be added to this trip.", confirmText: "Reject", destructive: true });
                    if (ok) { rejectMember(group.id, m.id); toast("Removed"); }
                  }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" className="h-7 gap-1" onClick={() => { approveMember(group.id, m.id); toast.success(`${m.name} approved`); }}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">awaiting owner</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Members ({active.length})</h3>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
                <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Riya" />
                  </div>
                  <div>
                    <Label>Mobile (optional)</Label>
                    <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
                  </div>
                  <div>
                    <Label>UPI ID (optional)</Label>
                    <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" />
                  </div>
                  <Button className="w-full" onClick={handleAdd} disabled={!name.trim()}>Add</Button>
                  <p className="text-xs text-muted-foreground">
                    Or share the trip code/link so they can join from their own phone — their changes will sync live.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="rounded-xl border border-border">
          {active.map((m, idx) => {
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
                    {m.leaveRequested && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">leave requested</span>}
                  </div>
                  {(m.phone || m.upiId) && (
                    <div className="truncate text-xs text-muted-foreground">
                      {[m.phone, m.upiId].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => cycleRole(m)}
                  disabled={!isOwner || isGroupOwner}
                  title={isOwner && !isGroupOwner ? "Tap to toggle admin" : ""}
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
                {canManage && m.leaveRequested && !isGroupOwner && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => clearLeaveRequest(group.id, m.id)}>Keep</Button>
                )}
                {canManage && !isMe && !isGroupOwner && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Remove ${m.name}?`,
                        description: "Their splits will be cleaned up. Past expenses they paid will be reassigned to the trip owner.",
                        confirmText: "Remove",
                        destructive: true,
                      });
                      if (ok) removeMember(group.id, m.id);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {isMe && !isGroupOwner && !m.leaveRequested && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({ title: "Request to leave this trip?", description: "The owner will approve removal so balances stay correct.", confirmText: "Request leave" });
                      if (ok) { requestLeave(group.id); toast.success("Leave request sent"); }
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
        {!isOwner && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Only the trip owner can approve new members and promote admins.
          </p>
        )}
      </div>
    </div>
  );
}
