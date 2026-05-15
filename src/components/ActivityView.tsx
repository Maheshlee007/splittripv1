import { useState, useMemo } from "react";
import { Group, ActivityItem as ActivityItemType } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { History, UserPlus, UserCheck, UserX, Receipt, ArrowRightLeft, Users, Archive, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVITY_CONFIG: Record<ActivityItemType["type"], { icon: typeof Receipt; color: string; bg: string; side: "left" | "right" }> = {
  join: { icon: UserPlus, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", side: "left" },
  approve: { icon: UserCheck, color: "text-success", bg: "bg-success/10 border-success/30", side: "left" },
  reject: { icon: UserX, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", side: "left" },
  expense: { icon: Receipt, color: "text-primary", bg: "bg-primary/10 border-primary/30", side: "right" },
  request: { icon: Receipt, color: "text-warning", bg: "bg-warning/10 border-warning/30", side: "right" },
  settlement: { icon: ArrowRightLeft, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30", side: "right" },
  member: { icon: Users, color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/30", side: "left" },
  archive: { icon: Archive, color: "text-muted-foreground", bg: "bg-secondary border-border", side: "left" },
  leave: { icon: LogOut, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", side: "left" },
};

type FilterType = "all" | "members" | "financial";

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "members", label: "Members" },
  { id: "financial", label: "Financial" },
];

const MEMBER_TYPES: ActivityItemType["type"][] = ["join", "approve", "reject", "member", "leave", "archive"];
const FINANCIAL_TYPES: ActivityItemType["type"][] = ["expense", "request", "settlement"];

export function ActivityView({ group }: { group: Group }) {
  const [filter, setFilter] = useState<FilterType>("all");
  const allItems = group.activity ?? [];

  const items = useMemo(() => {
    if (filter === "all") return allItems;
    if (filter === "members") return allItems.filter(i => MEMBER_TYPES.includes(i.type));
    return allItems.filter(i => FINANCIAL_TYPES.includes(i.type));
  }, [allItems, filter]);

  if (!allItems.length) {
    return <EmptyState icon={<History className="h-7 w-7" />} title="No activity yet" description="Trip changes will appear here." />;
  }

  // Group by day
  const dayKey = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const dayGroups: { label: string; items: ActivityItemType[] }[] = [];
  let currentDay = "";
  for (const item of items) {
    const day = dayKey(item.createdAt);
    if (day !== currentDay) {
      currentDay = day;
      dayGroups.push({ label: day, items: [] });
    }
    dayGroups[dayGroups.length - 1].items.push(item);
  }

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No matching activity.</p>
      )}

      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {dayGroups.map((dayGroup) => (
          <div key={dayGroup.label} className="mb-6 last:mb-0">
            {/* Day header */}
            <div className="sticky top-0 z-10 mb-3 flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {dayGroup.label}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Timeline — single column mobile, alternating on desktop */}
            <div className="relative md:mx-auto md:max-w-2xl">
              {/* Center line (desktop only) */}
              <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-border" />
              {/* Left line (mobile only) */}
              <div className="md:hidden absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-3">
                {dayGroup.items.map((item, i) => {
                  const config = ACTIVITY_CONFIG[item.type] ?? ACTIVITY_CONFIG.member;
                  const Icon = config.icon;
                  const side = config.side;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "relative animate-in fade-in duration-300",
                        // Mobile: always left-aligned with padding
                        "pl-8 md:pl-0",
                        // Desktop: alternate sides
                        side === "left" ? "md:pr-[calc(50%+1.25rem)] md:text-right" : "md:pl-[calc(50%+1.25rem)]"
                      )}
                      style={{ animationDelay: `${Math.min(i * 40, 400)}ms`, animationFillMode: "backwards" }}
                    >
                      {/* Dot — mobile (left) */}
                      <span className={cn(
                        "md:hidden absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full border",
                        config.bg
                      )}>
                        <Icon className={cn("h-2.5 w-2.5", config.color)} />
                      </span>

                      {/* Dot — desktop (center) */}
                      <span className={cn(
                        "hidden md:grid absolute top-1 left-1/2 -translate-x-1/2 h-5 w-5 place-items-center rounded-full border z-10",
                        config.bg
                      )}>
                        <Icon className={cn("h-2.5 w-2.5", config.color)} />
                      </span>

                      {/* Content */}
                      <div className={cn(
                        "flex items-start gap-2",
                        side === "left" ? "md:flex-row-reverse" : ""
                      )}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{item.actorName}</span>
                            <span className="text-muted-foreground"> {item.message}</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(item.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}