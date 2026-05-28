import { PageHeader } from "@/components/PageHeader";

export default function HowToPage() {
  return (
    <>
      <PageHeader title="How to Use" subtitle="Quick guide for trips, sync, and approvals" />
      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">1. Create or Join a Trip</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Owner creates a trip and shares trip code/link. Members join using the same code/link.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">2. Set Profile First</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            In Me tab, set your display name before joining. This ensures peers see your real name instead of placeholder values.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">3. Peer Sync (Owner + Members)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the same trip on both sides. Initial sync starts automatically. If needed, use the Sync button.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Online status dot is live while trip screen is open. If no heartbeat for ~30s, member shows offline.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">4. Requests and Approvals</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Members can submit expense requests. Owner/admin can approve/reject from Requests tab.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Approval/rejection actions appear in Activity and sync across peers.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">5. Advance Collection</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use advance collection in expense flow to track who already paid their share and who has not paid yet.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">6. Backup / Restore</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Use Me → Backup & restore to export JSON. Restore on same profile for seamless ownership and sync continuity.
          </p>
        </section>
      </div>
    </>
  );
}
