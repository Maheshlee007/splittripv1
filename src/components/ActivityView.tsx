import { Group } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { Activity, History } from "lucide-react";

export function ActivityView({ group }: { group: Group }) {
  const items = group.activity ?? [];
  if (!items.length) {
    return <EmptyState icon={<History className="h-7 w-7" />} title="No activity yet" description="Trip changes will appear here." />;
  }
  return (
    <div className="relative space-y-3 pl-5 before:absolute before:left-2 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
      {items.map((item) => (
        <div key={item.id} className="relative rounded-xl border border-border bg-card p-3 shadow-card">
          <span className="absolute -left-[1.08rem] top-3 grid h-6 w-6 place-items-center rounded-full border border-border bg-background text-primary">
            <Activity className="h-3.5 w-3.5" />
          </span>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.actorName}</p>
              <p className="text-xs text-muted-foreground">{item.message}</p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}