import { Link } from "react-router-dom";
import { useApp } from "@/store/AppStore";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ChevronRight, Compass } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { totalSpent } from "@/lib/balances";

export default function TripPickerPage({ title, subtitle, target }: { title: string; subtitle: string; target: "expenses" | "balances" | "requests" }) {
  const { groups } = useApp();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="mx-auto max-w-3xl px-4 py-4">
        {groups.length === 0 ? (
          <EmptyState
            icon={<Compass className="h-7 w-7" />}
            title="No trips yet"
            description="Create or join a trip first."
          />
        ) : (
          <div className="space-y-2">
            <p className="px-1 text-xs text-muted-foreground">Pick a trip</p>
            {groups.map((g) => (
              <Link
                key={g.id}
                to={`/trip/${g.id}?tab=${target}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition hover:bg-accent"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-xl">{g.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtMoney(totalSpent(g), g.currency)} · {g.members.length} members</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
