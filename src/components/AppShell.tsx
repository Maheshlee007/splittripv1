import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Home, Receipt, Inbox, Scale, User, Wifi, WifiOff, Sun, Moon, Monitor, ChevronLeft, ChevronRight, Radio, Download, X } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { onSyncStatus, type SyncStatus } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const tabs = [
  { to: "/", icon: Home, label: "Trips", end: true },
  { to: "/expenses", icon: Receipt, label: "Expenses" },
  { to: "/requests", icon: Inbox, label: "Requests" },
  { to: "/balances", icon: Scale, label: "Balances" },
  { to: "/me", icon: User, label: "Me" },
];

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { themePref, toggleTheme } = useApp();
  const Icon = themePref === "light" ? Sun : themePref === "dark" ? Moon : Monitor;
  const label = themePref[0].toUpperCase() + themePref.slice(1);
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      onClick={toggleTheme}
      aria-label={`Theme: ${themePref}. Click to cycle.`}
      className={cn("rounded-full hover:bg-secondary", compact ? "h-9 w-9" : "h-9 gap-2 px-3")}
    >
      <Icon className="h-[18px] w-[18px]" />
      {!compact && <span className="text-xs font-medium">{label}</span>}
    </Button>
  );
}

export default function AppShell() {
  const { ready, peers } = useApp();
  const loc = useLocation();
  const totalPeers = Object.values(peers).reduce((a, b) => a + b, 0);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem("splittrip:nav-collapsed") === "1");
  const [signalingUp, setSignalingUp] = useState(false);
  const { canInstall, promptInstall } = usePWAInstall();
  const [installDismissed, setInstallDismissed] = useState(() => sessionStorage.getItem("splittrip:pwa-dismissed") === "1");
  const showInstallBanner = canInstall && !installDismissed;

  useEffect(() => {
    localStorage.setItem("splittrip:nav-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    const off = onSyncStatus((_id, s: SyncStatus) => {
      if (s === "connected" || s === "signaling") setSignalingUp(true);
      else if (s === "offline") setSignalingUp(false);
    });
    return off;
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const StatusPill = () => {
    const live = totalPeers > 0;
    return (
      <span className={cn(
        "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        live ? "bg-success/15 text-success" : signalingUp ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
      )}>
        {live ? <Wifi className="h-3 w-3" /> : signalingUp ? <Radio className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {live ? `${totalPeers}` : signalingUp ? "waiting" : "offline"}
      </span>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-background md:flex-row overflow-hidden">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur safe-top px-4 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg gradient-primary text-primary-foreground text-xs font-bold">S</div>
          <div className="text-sm font-semibold">SplitTrip</div>
          <StatusPill />
        </div>
        <ThemeToggle compact />
      </div>

      {/* Desktop sidebar */}
      <aside className={cn(
        "relative hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 md:flex md:flex-col",
        collapsed ? "w-16" : "w-60"
      )}>
        <div className={cn("flex items-center gap-2 px-3 py-5", collapsed ? "justify-center" : "justify-between px-5")}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground font-bold">S</div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight">SplitTrip</div>
                <StatusPill />
              </div>
            )}
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              title={t.label}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />
                  )}
                  <t.icon className="h-4 w-4" />
                  {!collapsed && t.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom controls: theme + collapse */}
        <div className={cn("mt-auto flex items-center gap-1 border-t border-border p-2", collapsed ? "flex-col" : "justify-between px-3")}>
          <ThemeToggle compact={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {showInstallBanner && (
        <div className="mx-auto flex w-full max-w-screen-xl items-center gap-3 border-b border-border bg-primary/5 px-4 py-2 md:px-6">
          <Download className="h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1 text-xs">Install SplitTrip for offline use and a native app experience.</p>
          <Button size="sm" variant="default" className="h-7 gap-1 text-xs" onClick={promptInstall}>
            <Download className="h-3.5 w-3.5" /> Install
          </Button>
          <button
            className="grid h-6 w-6 place-items-center rounded-full hover:bg-secondary"
            onClick={() => { setInstallDismissed(true); sessionStorage.setItem("splittrip:pwa-dismissed", "1"); }}
            aria-label="Dismiss install banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0 no-scrollbar">
        <Outlet key={loc.pathname} />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border bg-card/95 backdrop-blur safe-bottom md:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -top-px left-1/2 h-1 w-8 -translate-x-1/2 rounded-b-full bg-primary" />
                )}
                <t.icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
