import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Home, Receipt, Inbox, Scale, User, Wifi, WifiOff, Sun, Moon, Monitor } from "lucide-react";
import { useApp } from "@/store/AppStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", icon: Home, label: "Trips", end: true },
  { to: "/expenses", icon: Receipt, label: "Expenses" },
  { to: "/requests", icon: Inbox, label: "Requests" },
  { to: "/balances", icon: Scale, label: "Balances" },
  { to: "/me", icon: User, label: "Me" },
];

function ThemeToggle() {
  const { themePref, toggleTheme } = useApp();
  const Icon = themePref === "light" ? Sun : themePref === "dark" ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Theme: ${themePref}. Click to cycle.`}
      className="h-9 w-9 rounded-full hover:bg-secondary"
    >
      <Icon className="h-[18px] w-[18px]" />
    </Button>
  );
}

export default function AppShell() {
  const { ready, peers } = useApp();
  const loc = useLocation();
  const totalPeers = Object.values(peers).reduce((a, b) => a + b, 0);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Mobile top bar with brand + theme toggle */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur safe-top px-4 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg gradient-primary text-primary-foreground text-xs font-bold">S</div>
          <div className="text-sm font-semibold">SplitTrip</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {totalPeers > 0 ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />}
            {totalPeers > 0 ? `${totalPeers}` : "·"}
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground font-bold">
              S
            </div>
            <div>
              <div className="text-base font-semibold leading-tight">SplitTrip</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {totalPeers > 0 ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3" />}
                {totalPeers > 0 ? `${totalPeers} peer${totalPeers === 1 ? "" : "s"}` : "offline"}
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
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
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 pb-20 md:pb-0">
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
