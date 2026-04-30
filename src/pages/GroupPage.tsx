import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Share2, Wifi, WifiOff, Trash2, FileSpreadsheet, FileText, MessageCircle, Image as ImageIcon, MoreVertical } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpensesList } from "@/components/ExpensesList";
import { BalancesView } from "@/components/BalancesView";
import { RequestsList } from "@/components/RequestsList";
import { MembersList } from "@/components/MembersList";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { ShareCodeDialog } from "@/components/ShareCodeDialog";
import { totalSpent } from "@/lib/balances";
import { fmtMoney } from "@/lib/format";
import { exportExcel, exportPDF, shareWhatsApp, exportImage } from "@/lib/exports";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function GroupPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getGroup, peers, addExpense, submitRequest, removeGroup, myRole } = useApp();
  const group = id ? getGroup(id) : undefined;
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const balRef = useRef<HTMLDivElement>(null);

  if (!group) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Trip not found.
      </div>
    );
  }

  const live = (peers[group.id] ?? 0) > 0;
  const role = myRole(group.id);
  const isAdmin = role === "owner" || role === "admin";

  const handleAdd = (payload: Parameters<typeof addExpense>[1]) => {
    if (isAdmin) addExpense(group.id, payload);
    else {
      submitRequest(group.id, payload);
      toast.success("Request sent to admin");
    }
  };

  const handleExportImage = async () => {
    if (!balRef.current) return;
    try {
      await exportImage(balRef.current, `${group.name}_balances.png`);
      toast.success("Image saved");
    } catch {
      toast.error("Couldn't export image");
    }
  };

  return (
    <>
      <PageHeader
        back="/"
        title={`${group.emoji} ${group.name}`}
        subtitle={
          <span className="flex items-center gap-1">
            {live ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />}
            {live ? `${peers[group.id]} peer${peers[group.id] === 1 ? "" : "s"}` : "offline"}
            <span>·</span>
            <code className="font-mono">{group.id}</code>
          </span>
        }
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => exportExcel(group)}><FileSpreadsheet className="h-4 w-4" /> Export Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPDF(group)}><FileText className="h-4 w-4" /> Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={async () => { await shareWhatsApp(group); toast.success("Shared / copied"); }}>
                  <MessageCircle className="h-4 w-4" /> Share to WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportImage}><ImageIcon className="h-4 w-4" /> Save balances as image</DropdownMenuItem>
                {role === "owner" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this trip locally? Other peers keep their copy.")) {
                          removeGroup(group.id);
                          nav("/");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete trip
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="mb-4 rounded-2xl gradient-primary p-4 text-primary-foreground shadow-elevated">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Total spent</p>
          <p className="text-3xl font-bold">{fmtMoney(totalSpent(group), group.currency)}</p>
          <p className="mt-1 text-xs opacity-80">{group.expenses.length} expenses · {group.members.length} members</p>
        </div>

        <Tabs defaultValue="expenses">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {group.requests.filter((r) => r.status === "pending").length > 0 && (
                <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[10px] text-warning-foreground">
                  {group.requests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>
          <TabsContent value="expenses" className="pt-4">
            <ExpensesList group={group} />
          </TabsContent>
          <TabsContent value="balances" className="pt-4">
            <div ref={balRef} className="rounded-2xl bg-background p-1">
              <BalancesView group={group} />
            </div>
          </TabsContent>
          <TabsContent value="requests" className="pt-4">
            <RequestsList group={group} />
          </TabsContent>
          <TabsContent value="members" className="pt-4">
            <MembersList group={group} />
          </TabsContent>
        </Tabs>
      </div>

      {/* FAB */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-elevated transition-transform active:scale-95 md:bottom-6"
        aria-label="Add expense"
      >
        <Plus className="h-6 w-6" />
      </button>

      <ExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        group={group}
        title={isAdmin ? "Add expense" : "Submit expense request"}
        saveLabel={isAdmin ? "Add" : "Send request"}
        onSave={handleAdd}
      />
      <ShareCodeDialog open={shareOpen} onOpenChange={setShareOpen} code={group.id} groupName={group.name} />
    </>
  );
}
