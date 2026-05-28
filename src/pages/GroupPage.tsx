import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Share2, Wifi, WifiOff, Trash2, FileSpreadsheet, FileText, MessageCircle, Image as ImageIcon, MoreVertical, FileJson, BarChart3, Archive, ArchiveRestore, Eye, Activity, Pencil, RefreshCw } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpensesList } from "@/components/ExpensesList";
import { BalancesView } from "@/components/BalancesView";
import { RequestsList } from "@/components/RequestsList";
import { MembersList } from "@/components/MembersList";
import { DashboardView } from "@/components/DashboardView";
import { ActivityView } from "@/components/ActivityView";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { ShareCodeDialog } from "@/components/ShareCodeDialog";
import { ExportPreview } from "@/components/ExportPreview";
import { totalSpent } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { exportExcel } from "@/lib/exports";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { useWebRTCSync } from "@/hooks/useWebRTCSync";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Group } from "@/lib/types";

type PreviewKind = "pdf" | "json" | "whatsapp" | "image" | null;

export default function GroupPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { getGroup, peers, addExpense, submitRequest, removeGroup, setArchived, setSyncEnabled, updateGroup, myRole, profile, handleRemoteGroup, handleRemoteKick, handleTripEnded, setBroadcaster, setKickCaster, setTripPeers } = useApp();
  const confirm = useConfirm();
  const group = id ? getGroup(id) : undefined;
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewKind>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef(group);
  groupRef.current = group;

  if (!group) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Trip not found.
      </div>
    );
  }

  const peerCount = Array.isArray(peers[group.id]) ? peers[group.id].length : 0;
  const live = peerCount > 1;
  const role = myRole(group.id);
  const isAdmin = role === "owner" || role === "admin";
  const selfMember = group.members.find((m) => m.id === profile.id);
  const selfPending = selfMember?.status === "pending";

  const handleAdd = (payload: Parameters<typeof addExpense>[1]) => {
    if (group.archived) { toast.error("Trip is archived"); return; }
    if (isAdmin) addExpense(group.id, payload);
    else {
      submitRequest(group.id, payload);
      toast.success("Request sent to admin");
    }
  };

  const initialTab = params.get("tab") || "expenses";
  const isHost = role === "owner";

  const { status, onlineMembers, lastSyncedAt, isSyncing, broadcastGroup, broadcastKick, broadcastEndTrip, disconnectAndLeave, reconnect, startSync } = useWebRTCSync(
    group.id,
    group.inviteToken,
    isHost,
    profile.id,
    handleRemoteGroup,
    handleRemoteKick,
    handleTripEnded,
    () => {
      // Use ref to always get latest group state when a peer connects
      const latestGroup = groupRef.current;
      if (latestGroup) broadcastGroup(latestGroup, true);
    },
    group.syncDisabled
  );

  useEffect(() => {
    setTripPeers(group.id, onlineMembers);
  }, [onlineMembers, group.id, setTripPeers]);

  useEffect(() => {
    setBroadcaster(broadcastGroup);
    setKickCaster(broadcastKick);
    return () => {
      setBroadcaster(null);
      setKickCaster(null);
    };
  }, [broadcastGroup, broadcastKick, setBroadcaster, setKickCaster]);

  const [forceOffline, setForceOffline] = useState(false);
  const hasLocalData = group.expenses.length > 0;
  const wasApproved = selfMember?.status === "active";
  const autoSyncStartedRef = useRef(false);

  // Initial auto-sync to avoid requiring manual "Sync" on first join.
  useEffect(() => {
    if (group.syncDisabled || group.archived) return;
    if (status !== "idle" || isSyncing) return;
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    startSync({ silent: true });
  }, [group.syncDisabled, group.archived, status, isSyncing, startSync]);

  // Member retry loop every 30s while waiting in the same screen (visible tab only).
  useEffect(() => {
    if (group.syncDisabled || group.archived || isHost) return;
    if (wasApproved || forceOffline || hasLocalData || status === "connected") return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (isSyncing) return;
      startSync({ silent: true });
    };

    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [group.syncDisabled, group.archived, isHost, wasApproved, forceOffline, hasLocalData, status, isSyncing, startSync]);

  // Show WaitingRoom only for non-hosts who haven't been approved yet AND don't have local data
  // Once approved (even if offline), member sees the trip page; WebRTC reconnects in background
  if (!isHost && !wasApproved && status !== "connected" && !forceOffline && !hasLocalData) {
    return (
      <WaitingRoom 
        status={status} 
        tripId={group.id} 
        code={group.inviteToken || ""} 
        hasLocalData={hasLocalData}
        onContinueOffline={() => setForceOffline(true)}
      />
    );
  }
  // If not connected but has local data, show the page with offline indicator
  // (they'll see stale data until host comes back)

  return (
    <>
      <PageHeader
        back="/"
        title={`${group.emoji} ${group.name}${group.archived ? " · archived" : ""}`}
        subtitle={
          <span className="flex items-center gap-1">
            {live ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />}
            {live ? `${peerCount} peer${peerCount === 1 ? "" : "s"}` : "offline"}
            {isSyncing && (
              <span className="text-[10px] text-warning animate-pulse ml-1">syncing…</span>
            )}
            <span>·</span>
            <code className="font-mono">{group.id}</code>
          </span>
        }
        actions={
          <div className="flex items-center gap-1">
            {!group.syncDisabled && (
              <Button size="sm" variant="ghost" onClick={() => startSync()} title={isHost ? "Sync All" : "Sync Data"} disabled={isSyncing}>
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={async () => {
                      const newName = prompt("Rename trip:", group.name);
                      if (newName && newName.trim() && newName.trim() !== group.name) {
                        updateGroup(group.id, (g) => ({ ...g, name: newName.trim() }));
                        toast.success("Trip renamed");
                      }
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Rename trip
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => exportExcel(group)}><FileSpreadsheet className="h-4 w-4" /> Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreview("pdf")}><FileText className="h-4 w-4" /> Preview PDF <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreview("json")}><FileJson className="h-4 w-4" /> Preview JSON <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreview("whatsapp")}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp text <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPreview("image")}><ImageIcon className="h-4 w-4" /> Dashboard image <Eye className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuItem>
                {role === "owner" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => {
                        const next = !group.archived;
                        const ok = await confirm({
                          title: next ? "End this trip (Read-only)?" : "Restore this trip?",
                          description: next
                            ? "Archived trips become read-only. You can restore later."
                            : "The trip becomes editable again.",
                          confirmText: next ? "Archive" : "Restore",
                        });
                        if (ok) { setArchived(group.id, next); toast.success(next ? "Archived" : "Restored"); }
                      }}
                    >
                      {group.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {group.archived ? "Restore trip" : "End trip (Read-only)"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete this trip locally?",
                          description: "Other peers keep their copy. This cannot be undone on this device.",
                          confirmText: "Delete",
                          destructive: true,
                        });
                        if (ok) { 
                          disconnectAndLeave();
                          removeGroup(group.id); 
                          nav("/"); 
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete trip
                    </DropdownMenuItem>
                  </>
                )}
                {role !== "owner" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Leave this trip?",
                          description: "You will be removed from the trip and local data deleted.",
                          confirmText: "Leave",
                          destructive: true,
                        });
                        if (ok) { 
                          disconnectAndLeave();
                          removeGroup(group.id); 
                          nav("/"); 
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Leave trip
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-screen-xl px-4 pt-4 pb-32 md:pb-16">
        {/* Sync status banner */}
        {status !== "connected" && !group.syncDisabled && !group.archived && (
          <div className="mb-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning flex items-center justify-between gap-2">
            <span>
              {isHost
                ? "📡 Offline — Ask members to be active, then click Sync to connect."
                : "📡 Offline — Ask the trip owner to be active and click Sync."}
              {lastSyncedAt && (
                <span className="ml-1 text-muted-foreground">
                  Last synced: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </span>
            <Button size="sm" variant="outline" className="h-6 text-[10px] shrink-0" onClick={() => startSync()} disabled={isSyncing}>
              <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing…" : "Sync"}
            </Button>
          </div>
        )}
        {selfPending && (
          <div className="mb-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            ⏳ Waiting for the trip owner to approve your join request. You'll see live updates once approved.
          </div>
        )}
        {group.archived && (
          <div className="mb-3 rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            🗄️ This trip is archived and read-only.
          </div>
        )}

        <div className="mb-4 overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground shadow-elevated">
          <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">Total spent</p>
          <p className="text-3xl font-bold tabular-nums">{fmtMoney(totalSpent(group), group.currency)}</p>
          <div className="mt-2 flex items-center gap-3 text-xs opacity-90">
            <span>{group.expenses.length} expense{group.expenses.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{group.members.filter((m) => m.status !== "pending").length} active</span>
            {group.members.some((m) => m.status === "pending") && (
              <>
                <span>·</span>
                <span>{group.members.filter((m) => m.status === "pending").length} pending</span>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue={initialTab}>
          <div className="sticky top-0 z-10 -mx-1 overflow-x-auto pb-1 bg-background pt-1">
            <TabsList className="inline-flex w-max min-w-full gap-1 px-1">
              <TabsTrigger value="expenses" className="shrink-0 px-3">Expenses</TabsTrigger>
              <TabsTrigger value="balances" className="shrink-0 px-3">Balances</TabsTrigger>
              <TabsTrigger value="dashboard" className="shrink-0 px-3"><BarChart3 className="h-3.5 w-3.5" /></TabsTrigger>
              <TabsTrigger value="activity" className="shrink-0 px-3"><Activity className="h-3.5 w-3.5" /></TabsTrigger>
              <TabsTrigger value="requests" className="shrink-0 px-3">
                Requests
                {(group.requests.filter((r) => r.status === "pending").length + group.settlements.filter((s) => s.status === "pending").length) > 0 && (
                  <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[10px] text-warning-foreground">
                    {group.requests.filter((r) => r.status === "pending").length + group.settlements.filter((s) => s.status === "pending").length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="members" className="shrink-0 px-3">
                Members
                {group.members.filter((m) => m.status === "pending").length > 0 && (
                  <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[10px] text-warning-foreground">
                    {group.members.filter((m) => m.status === "pending").length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="expenses" className="pt-4">
            <ExpensesList group={group} />
          </TabsContent>
          <TabsContent value="balances" className="pt-4">
            <BalancesView group={group} />
          </TabsContent>
          <TabsContent value="dashboard" className="pt-4">
            <DashboardView ref={dashRef} group={group} />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <ActivityView group={group} />
          </TabsContent>
          <TabsContent value="requests" className="pt-4">
            <RequestsList group={group} />
          </TabsContent>
          <TabsContent value="members" className="pt-4">
            <MembersList group={group} onlineMembers={onlineMembers} />
          </TabsContent>
        </Tabs>
      </div>

      {!selfPending && !group.archived && (
        <button
          onClick={() => setAddOpen(true)}
          className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-elevated transition-transform active:scale-95 md:bottom-6"
          aria-label="Add expense"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <ExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        group={group}
        title={isAdmin ? "Add expense" : "Submit expense request"}
        saveLabel={isAdmin ? "Add" : "Send request"}
        onSave={handleAdd}
      />
      <ShareCodeDialog open={shareOpen} onOpenChange={setShareOpen} groupId={group.id} inviteToken={group.inviteToken} groupName={group.name} />
      <ExportPreview
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        group={group}
        kind={preview}
        imageNode={dashRef.current}
      />
    </>
  );
}
