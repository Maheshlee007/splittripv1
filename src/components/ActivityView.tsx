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
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.id} className="relative rounded-xl border border-border bg-card p-3 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-background text-primary">
                <Activity className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.actorName}</p>
                <p className="text-xs text-muted-foreground">{item.message}</p>
              </div>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}