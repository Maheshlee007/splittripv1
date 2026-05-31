import { PageHeader } from "@/components/PageHeader";
import { Link } from "react-router-dom";

interface StepProps {
  num: number;
  title: string;
  children: React.ReactNode;
  image?: string;
  alt?: string;
}

function Step({ num, title, children, image, alt }: StepProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
          {num}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      {image && (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          <img
            src={image}
            alt={alt ?? title}
            loading="lazy"
            className="w-full h-auto"
          />
        </div>
      )}
    </section>
  );
}

export default function HowToPage() {
  return (
    <>
      <PageHeader title="How to Use" subtitle="A visual walkthrough of every screen" />
      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">SplitTrip is local-first.</p>
          <p className="mt-1 text-muted-foreground">
            All your data lives on this device (IndexedDB + localStorage). No accounts, no servers. Trips sync directly with peers over WebRTC when both sides are online.
          </p>
        </section>

        <Step num={1} title="Set up your profile first" image="/screenshots/02-me-page.png" alt="Me tab showing profile, app lock and backup">
          <p>
            Open the <strong>Me</strong> tab and enter your display name (required), optional mobile and UPI ID. Tap <em>Save profile</em>.
          </p>
          <p>
            Your UPI ID lets others tap <em>Pay</em> on their balance to settle with you in one tap — it pre-fills their UPI app with your VPA.
          </p>
        </Step>

        <Step num={2} title="Create or join a trip" image="/screenshots/04-create-trip.png" alt="Create trip dialog">
          <p>
            From the <strong>Trips</strong> tab tap <strong>New</strong> → <em>Create</em>. Pick a name, emoji, currency, and visibility:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Shared</strong> — invite team & peers via code/QR.</li>
            <li><strong>Self Track</strong> — manage Group expenses alone (no sync).</li>
          </ul>
          <p>To join an existing trip, switch to the <em>Join</em> tab in the same dialog and paste the trip code shared by the owner.</p>
        </Step>

        <Step num={3} title="Inside a trip" image="/screenshots/05-trip-detail.png" alt="Trip detail page">
          <p>
            The trip page shows total spent, sync status, and tabs for Expenses, Balances, Activity, Lending, Requests and Members. The big <strong>+</strong> button (bottom right) opens the expense dialog.
          </p>
          <p>
            The pill above the tabs tells you if peers are connected. Tap <strong>Sync</strong> to reconnect when both sides are open.
          </p>
        </Step>

        <Step num={4} title="Add an expense" image="/screenshots/06-add-expense.png" alt="Add expense dialog">
          <p>
            Enter description, amount, date and who paid. Pick a category and (optionally) attach a bill photo — it stays on your device and is sent peer-to-peer.
          </p>
          <p>
            <strong>Split among</strong> lets you choose Equal / Shares / Exact / %. Toggle members in or out of the split with the checkboxes below.
          </p>
          <p>
            Turn on <em>Advance collection</em> if some members have already paid their share — you can mark each share paid as you collect it.
          </p>
        </Step>

        <Step num={5} title="Requests &amp; approvals">
          <p>
            Non-owner members can submit an expense as a <strong>request</strong>. Owner/admin approves or rejects it from the <em>Requests</em> tab. Approved requests become normal expenses and appear in Activity for everyone.
          </p>
        </Step>

        <Step num={6} title="Personal mode" image="/screenshots/03-personal-dashboard.png" alt="Personal dashboard">
          <p>
            Switch the sidebar toggle to <strong>Personal</strong> for a private expense tracker that is never synced to peers. You get a monthly dashboard, category chart, recent transactions, and a yearly overview.
          </p>
          <p>
            Use <strong>Lending</strong> to track money you have lent or borrowed outside of trips — it appears on the same dashboard as "Owed to Me" / "I Owe".
          </p>
        </Step>

        <Step num={7} title="Lock the app" image="/screenshots/08-passcode-setup.png" alt="Set passcode dialog">
          <p>
            On the Me tab, the <strong>App lock</strong> section lets you enable native biometric (Touch ID / Face ID / Windows Hello / Android fingerprint) or a 4–6 digit passcode.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Re-authentication is required every time the app is opened or returns from background (with a 30s grace period for quick switches).</li>
            <li>5 wrong PIN attempts trigger an exponential cool-down (5s → 60s).</li>
            <li>When biometric is on, you can add a <em>backup passcode</em> so you are not locked out if the biometric sensor fails.</li>
            <li>All credentials are stored locally (PBKDF2 hash + WebAuthn credential ID). Nothing leaves your device.</li>
          </ul>
        </Step>

        <Step num={8} title="Backup &amp; restore">
          <p>
            From <strong>Me → Backup &amp; restore</strong> tap <em>Export all</em> to download a single JSON file containing your profile, every trip, personal expenses, budgets, payment methods, and lendings.
          </p>
          <p>
            Restore the same JSON on a new browser / device with <em>Restore</em>. Use the same profile name when possible so peer sync continues seamlessly.
          </p>
          <p className="text-xs">
            Tip: take a backup before clearing browser data or switching browsers. SplitTrip also requests <code>navigator.storage.persist()</code> so Chrome will not auto-evict your IndexedDB after a week of inactivity.
          </p>
        </Step>

        <Step num={9} title="Install as an app">
          <p>
            On mobile, use your browser's <em>Add to home screen</em> option. On desktop Chrome/Edge, click the install icon in the URL bar. Installed PWAs get truly persistent storage and a faster, full-screen experience.
          </p>
        </Step>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-card text-sm">
          <h3 className="font-semibold mb-1">Troubleshooting</h3>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><strong>Peer shows offline:</strong> open the same trip on both sides, then tap <em>Sync</em>. Heartbeat stops after ~30s of inactivity.</li>
            <li><strong>Restored backup shows fewer items:</strong> make sure you exported from this app — third-party JSONs will not pass schema validation.</li>
            <li><strong>Forgot passcode &amp; biometric failed:</strong> add a backup passcode the moment you enable biometric — there is no recovery channel because everything is local.</li>
          </ul>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Need to come back here later? It is always linked from <Link to="/me" className="underline">Me → Help</Link>.
        </p>
      </div>
    </>
  );
}
