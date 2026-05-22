import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Users, LogIn, Wifi, WifiOff, Upload, MoreVertical, Archive, ArchiveRestore, Trash2, Share2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ConfirmDialog";
import { ShareCodeDialog } from "@/components/ShareCodeDialog";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, relativeTime } from "@/lib/format";
import { totalSpent } from "@/lib/balances";
import { ProfileSetupDialog } from "@/components/ProfileSetupDialog";
import { QRScannerDialog } from "@/components/QRScannerDialog";
import { importJSON } from "@/lib/exports";
import { toast } from "sonner";

const EMOJIS = ["🧳", "🏖️", "🏔️", "🏝️", "🎒", "🛣️", "🍻", "🎉", "🚗", "✈️"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY"];

export default function TripsPage() {
  const { groups, createGroup, joinGroup, profile, peers, hasProfile, importGroup } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🧳");
  const [currency, setCurrency] = useState("INR");
  const [code, setCode] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [syncDisabled, setSyncDisabled] = useState(false);
  const [profileGate, setProfileGate] = useState<null | "create" | { join: string; secret?: string }>(null);
  const [shareGroup, setShareGroup] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handledJoinRef = useRef(false);
  const confirm = useConfirm();

  // Auto-join via ?join=CODE  or  ?trip=CODE&code=SECRET[&sdp=...]
  useEffect(() => {
    const j = (params.get("join") || params.get("trip") || "").toUpperCase().trim();
    const secret = params.get("code") || undefined;
    const sdp = params.get("sdp");
    if (!j || handledJoinRef.current) return;
    handledJoinRef.current = true;
    if (j.length !== 6) { setParams({}, { replace: true }); return; }
    if (!hasProfile) {
      setProfileGate({ join: j, secret });
      return;
    }
    const g = joinGroup(j, secret);
    setParams({}, { replace: true });
    if (sdp) {
      // Offline QR fallback: stash for the trip page to consume
      try { sessionStorage.setItem(`splittrip:offline-offer:${j}`, sdp); } catch {}
    }
    toast.success(`Joining ${g.name} — waiting for owner approval`);
    nav(`/trip/${g.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, hasProfile]);

  const openCreate = () => {
    if (!hasProfile) { setProfileGate("create"); return; }
    setTab("create"); setOpen(true);
  };
  const openJoin = () => {
    if (!hasProfile) { setProfileGate({ join: "" }); return; }
    setTab("join"); setOpen(true);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    const g = createGroup(name.trim(), emoji, currency, syncDisabled);
    setOpen(false);
    setName("");
    nav(`/trip/${g.id}`);
  };
  const handleJoin = () => {
    if (code.trim().length !== 6 || secretKey.trim().length === 0) return;
    const g = joinGroup(code, secretKey.trim());
    setOpen(false);
    setCode("");
    setSecretKey("");
    toast.success("Joining — owner will approve you");
    nav(`/trip/${g.id}`);
  };

  const handleScan = (url: string) => {
    try {
      const parsed = new URL(url);
      const j = (parsed.searchParams.get("trip") || parsed.searchParams.get("join") || "").toUpperCase().trim();
      const secret = parsed.searchParams.get("code") || undefined;
      
      if (j && j.length === 6) {
        if (!hasProfile) {
          setProfileGate({ join: j, secret });
          return;
        }
        const g = joinGroup(j, secret);
        toast.success(`Joined ${g.name}`);
        nav(`/trip/${g.id}`);
      } else {
        toast.error("Invalid QR code");
      }
    } catch {
      toast.error("Invalid QR code format");
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const g = await importJSON(file);
      importGroup(g);
      toast.success(`Imported ${g.name}`);
      nav(`/trip/${g.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Your trips"
        subtitle={profile.name ? `Hi ${profile.name}` : "Welcome — set up your profile to begin"}
        actions={
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => handleImport(e.target.files?.[0])} />
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title="Import .splittrip.json">
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Add a trip</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "create" | "join")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="join">Join</TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="space-y-4 pt-4">
              <div>
                <Label>Trip name</Label>
                <Input
                  autoFocus
                  placeholder="Goa weekend"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div>
                <Label>Emoji</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition ${
                        emoji === e ? "bg-accent ring-2 ring-primary" : "bg-secondary"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Currency</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        currency === c
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Visibility</Label>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setSyncDisabled(false)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      !syncDisabled ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5"><Users className="h-4 w-4" /> Shared</div>
                    <div className="mt-0.5 text-[10px] font-normal opacity-80">With team & peers</div>
                  </button>
                  <button
                    onClick={() => setSyncDisabled(true)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      syncDisabled ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5"><WifiOff className="h-4 w-4" /> Self Track</div>
                    <div className="mt-0.5 text-[10px] font-normal opacity-80">Manage expenses Alone</div>
                  </button>
                </div>
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={!name.trim()}>
                Create trip
              </Button>
            </TabsContent>
            <TabsContent value="join" className="space-y-4 pt-4">
              <div>
                <Label>Trip code</Label>
                <Input
                  autoFocus
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-[0.4em]"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Ask the trip owner for the 6-character code or invite link. The owner approves you before you can edit.
                </p>
              </div>
              <div>
                <Label>Secret Key</Label>
                <Input
                  placeholder="Paste the secret link code..."
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="font-mono"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleJoin} disabled={code.length !== 6 || secretKey.length === 0}>
                  Join trip
                </Button>
                <Button variant="secondary" onClick={() => setScanOpen(true)}>
                  Scan QR
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      <QRScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={handleScan} />

      <ProfileSetupDialog
        open={!!profileGate}
        onOpenChange={(v) => { if (!v) setProfileGate(null); }}
        onDone={() => {
          const gate = profileGate;
          setProfileGate(null);
          if (gate === "create") { setTab("create"); setOpen(true); }
          else if (gate && typeof gate === "object" && "join" in gate) {
            if (gate.join) {
              const g = joinGroup(gate.join, gate.secret);
              setParams({}, { replace: true });
              nav(`/trip/${g.id}`);
            } else {
              setTab("join"); setOpen(true);
            }
          }
        }}
      />

      <div className="mx-auto w-full max-w-screen-xl px-4 py-4">
        <BackupReminderBanner show={hasProfile} />
        {groups.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="No trips yet"
            description="Create your first trip or join one with a code shared by your group owner."
            action={
              <div className="flex gap-2">
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Create
                </Button>
                <Button variant="secondary" onClick={openJoin} className="gap-1.5">
                  <LogIn className="h-4 w-4" /> Join
                </Button>
              </div>
            }
          />
        ) : (
          <TripGrids groups={groups} peers={peers} nav={nav} setShareGroup={setShareGroup} />
        )}
      </div>

      {shareGroup && (
        <ShareCodeDialog
          open={!!shareGroup}
          onOpenChange={(v) => !v && setShareGroup(null)}
          groupId={shareGroup.id}
          inviteToken={shareGroup.inviteToken}
          groupName={shareGroup.name}
        />
      )}
    </>
  );
}

function TripGrids({ groups, peers, nav, setShareGroup }: { groups: any[]; peers: Record<string, string[]>; nav: (p: string) => void; setShareGroup: (g: any) => void }) {
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);
  const { setArchived, removeGroup, handleTripEnded, profile } = useApp();
  const confirm = useConfirm();

  const handleEnd = async (g: any) => {
    const isHost = g.ownerId === profile?.id || g.members.find((m: any) => m.id === profile?.id)?.role === "owner";
    const ok = await confirm({
      title: g.archived ? "Restore this trip?" : "End this trip?",
      description: g.archived ? "The trip becomes editable again." : "The trip will be marked as Read-Only.",
      confirmText: g.archived ? "Restore" : "End Trip",
    });
    if (ok) {
      setArchived(g.id, !g.archived);
      toast.success(g.archived ? "Restored" : "Ended");
    }
  };

  const handleDelete = async (g: any) => {
    const ok = await confirm({
      title: "Delete trip locally?",
      description: "This removes the trip from this device. Cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) {
      removeGroup(g.id);
      toast.success("Deleted");
    }
  };

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active ({active.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((g) => (
              <TripCard key={g.id} g={g} live={(peers[g.id]?.length ?? 0) > 1} peerCount={(peers[g.id]?.length ?? 0) > 0 ? peers[g.id].length - 1 : 0} onClick={() => nav(`/trip/${g.id}`)} onEnd={() => handleEnd(g)} onDelete={() => handleDelete(g)} onShare={() => setShareGroup(g)} />
            ))}
          </div>
        </section>
      )}
      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ended (Read-only) ({archived.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2 opacity-80">
            {archived.map((g) => (
              <TripCard key={g.id} g={g} live={false} peerCount={0} onClick={() => nav(`/trip/${g.id}`)} onEnd={() => handleEnd(g)} onDelete={() => handleDelete(g)} onShare={() => setShareGroup(g)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TripCard({ g, live, peerCount, onClick, onEnd, onDelete, onShare }: { g: any; live: boolean; peerCount: number; onClick: () => void; onEnd: () => void; onDelete: () => void; onShare: () => void; }) {
  const total = totalSpent(g);
  return (
    <Card
      onClick={onClick}
      className="group relative cursor-pointer overflow-visible border-border/60 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-2xl">{g.emoji}</div>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 truncate font-semibold">
              {g.name}
              {g.archived && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">ended</span>}
              {g.syncDisabled && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">self</span>}
            </h3>
            <p className="text-xs text-muted-foreground">
              {g.members.length} member{g.members.length === 1 ? "" : "s"} · {relativeTime(g.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onShare} disabled={g.syncDisabled}>
                <Share2 className="mr-2 h-4 w-4" /> Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEnd}>
                {g.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                {g.archived ? "Restore trip" : "End trip"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!g.archived && !g.syncDisabled && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${live ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {live ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {live ? `${peerCount}` : "offline"}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Spent</p>
          <p className="text-lg font-semibold tabular-nums">{fmtMoney(total, g.currency)}</p>
        </div>
      </div>
    </Card>
  );
}

function BackupReminderBanner({ show }: { show: boolean }) {
  const KEY = "splittrip:backup-hint-dismissed";
  const [open, setOpen] = useState(() => show && typeof localStorage !== "undefined" && !localStorage.getItem(KEY));
  if (!open) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
      <span className="mt-0.5">💾</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Take a backup before clearing app data.</p>
        <p className="mt-0.5 opacity-90">Your trips live only on this device. Export a JSON backup from the Me tab any time.</p>
      </div>
      <button onClick={() => { try { localStorage.setItem(KEY, "1"); } catch {} setOpen(false); }} className="text-warning/70 hover:text-warning">✕</button>
    </div>
  );
}
