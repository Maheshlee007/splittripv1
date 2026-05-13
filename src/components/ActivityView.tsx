import { Group, ActivityItem as ActivityItemType } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { History, UserPlus, UserCheck, UserX, Receipt, ArrowRightLeft, Users, Archive, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVITY_CONFIG: Record<ActivityItemType["type"], { icon: typeof Receipt; color: string; bg: string }> = {
  join: { icon: UserPlus, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30" },
  approve: { icon: UserCheck, color: "text-success", bg: "bg-success/10 border-success/30" },
  reject: { icon: UserX, color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  expense: { icon: Receipt, color: "text-primary", bg: "bg-primary/10 border-primary/30" },
  request: { icon: Receipt, color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  settlement: { icon: ArrowRightLeft, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
  member: { icon: Users, color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/30" },
  archive: { icon: Archive, color: "text-muted-foreground", bg: "bg-secondary border-border" },
  leave: { icon: LogOut, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30" },
};

export function ActivityView({ group }: { group: Group }) {
  const items = group.activity ?? [];
  if (!items.length) {
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

          {/* Timeline */}
          <div className="relative ml-3 border-l-2 border-border pl-5 space-y-3">
            {dayGroup.items.map((item, i) => {
              const config = ACTIVITY_CONFIG[item.type] ?? ACTIVITY_CONFIG.member;
              const Icon = config.icon;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "relative",
                    "animate-in fade-in slide-in-from-left-2 duration-300"
                  )}
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms`, animationFillMode: "backwards" }}
                >
                  {/* Dot on timeline */}
                  <span className={cn(
                    "absolute -left-[27px] top-1.5 grid h-5 w-5 place-items-center rounded-full border",
                    config.bg
                  )}>
                    <Icon className={cn("h-2.5 w-2.5", config.color)} />
                  </span>

                  {/* Content */}
                  <div className="flex items-start justify-between gap-3">
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
      ))}
    </div>
  );
}