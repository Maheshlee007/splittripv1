# SplitTrip — Group Expense PWA (P2P, No Backend)

A mobile-first, installable PWA that lets a group create a trip "room", invite members via a 6-character code, log expenses peer-to-peer with live sync, and settle up via UPI — all with **zero backend**. Inspired by PeerSplit (Yjs + WebRTC), extended with roles, request/approval, UPI split, and Drive backup.

---

## 1. App format

**Installable PWA** (Add to Home Screen on Android/iOS/desktop).

- Works offline, installs like a native app, no app store needed.
- Code stays Capacitor-compatible so we can wrap it as a true native app later if you want Play Store distribution.

## 2. Sync architecture (the core decision)

**Yjs CRDT + y-webrtc** (same proven stack as PeerSplit).

```text
   Phone A  ─┐                          ┌─ Phone C
            ├─ WebRTC mesh (room=ABC123)┤
   Phone B  ─┘   (free public signaling)└─ Phone D
        │                                    │
        └── IndexedDB (local-first, offline) ┘
```

- **Room code** = Yjs document name. Anyone with the code joins the mesh.
- **Conflict-free**: two people editing the same expense offline merge automatically on reconnect.
- **No server stores your data.** Public signaling servers only exchange "how to connect" handshakes (no expense data).
- **Offline-first**: IndexedDB via `y-indexeddb`. Sync resumes when peers come online.
- **Disaster recovery**: each user can push an encrypted snapshot to their own Google Drive (`appDataFolder`) and pull it back on a new device.

## 3. Roles & permissions


| Action                                       | Owner | Admin | Member |
| -------------------------------------------- | ----- | ----- | ------ |
| Create/delete group                          | ✓     | —     | —      |
| Promote/demote admins                        | ✓     | —     | —      |
| Edit anyone's expense                        | ✓     | ✓     | —      |
| Add own expense                              | ✓     | ✓     | ✓      |
| **Submit expense request** (sub-group spend) | ✓     | ✓     | ✓      |
| Approve/reject requests                      | ✓     | ✓     | —      |
| Export / share                               | ✓     | ✓     | ✓      |


Roles stored in the Yjs doc and protected by signature: each user has a local keypair; admin actions are signed so a malicious member can't fake a role change.

## 4. Feature list

### Core

- Multiple groups (trips), each with its own room code + QR.
- Add expense: amount, payer, split mode (equal / by share / by exact / by % / itemized), category, note, photo of bill (stored locally, optional).
- Live balances ("X owes Y ₹230") with simplified settle-up graph.
- Member request inbox → admin approves → expense added.
- Activity timeline of every change, with who/when.
- Light + dark mode (orange accent light, radium-green accent dark).

### Sharing & exports

- **Excel export** (.xlsx) with summary + per-member sheets.
- **PDF export** of the trip summary.
- **WhatsApp share** — pre-formatted text block ("Trip: Goa | Total ₹12,450 | Aman owes Riya ₹450 …") via `navigator.share`.
- **Image export** of the balances card (html-to-canvas) for Insta/WhatsApp story.

### UPI / Payments (no payment gateway needed)

- Save each member's UPI ID once.
- **"Settle up" button** generates `upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tn=<note>` — opens GPay/PhonePe/Paytm directly.
- **"Split this expense" button** on any expense: shows each debtor with their own pay-button that deep-links to the payer's UPI ID with the exact owed amount. (One tap per debtor — UPI doesn't support multi-payee in a single intent.)
- QR code generator for the payer's UPI ID with amount baked in (any UPI app can scan).
- Mark settlement as "paid" → syncs to all peers.

### Backup & recovery

- **Manual export/import** of the whole group as encrypted JSON file.
- **Optional Google Drive backup** (per-user, hidden app folder) — auto-snapshot on change, restore on reinstall. Uses Drive OAuth in the browser; no server.
- **Re-join by code**: even if local data is wiped, joining the room with the same code re-syncs from any peer that's online.

### Quality-of-life

- Categories with icons (food, stay, travel, fuel, tickets, misc).
- Multi-currency with daily FX cache.
- Per-trip budget + progress bar.
- Search & filter expenses.
- Recurring expense templates.
- Haptic feedback, swipe-to-delete, pull-to-refresh.

## 5. UI structure

```text
┌─ Bottom tab bar (mobile) / sidebar (desktop) ─┐
│  Trips   Expenses   Requests   Balances   Me  │
└────────────────────────────────────────────────┘

Trips        → list of groups, "+ Create" / "Join with code"
Expenses     → feed of a selected trip, FAB to add
Requests     → admin: pending approvals; member: my submissions
Balances     → who owes whom, settle-up buttons (UPI), share/export
Me           → profile, UPI ID, theme, Drive backup, keypair export
```

Design: clean card-based, large tap targets, semantic tokens in `index.css`. Light = white bg + orange (#F97316) accent. Dark = near-black + radium green (#39FF14, toned to ~#22E06A for legibility) accent. Both modes share the same component set.

## 6. Technical specs

- **Stack**: existing React + Vite + Tailwind + shadcn (already in repo).
- **Sync**: `yjs`, `y-webrtc`, `y-indexeddb`.
- **Crypto**: WebCrypto (Ed25519 keypair per device) for signing admin actions and encrypting Drive backups.
- **PWA**: `vite-plugin-pwa` with `devOptions.enabled: false` + iframe-guarded SW registration (per Lovable PWA rules), manifest with icons + `display: standalone`.
- **Exports**: `xlsx` (SheetJS), `jspdf` + `jspdf-autotable`, `html-to-image` for image, `qrcode` for UPI QR.
- **Drive backup**: Google Identity Services token client → Drive REST `appDataFolder` (no edge function, runs entirely in browser).
- **No Lovable Cloud / no Supabase / no edge functions** in v1. If Drive proves flaky for some users we can add an optional Cloudflare R2 relay later — flagged but not built.

## 7. Build phases

1. **Foundation** — design tokens (light/dark, orange + green), shell layout, bottom nav, routing.
2. **Local groups + expenses** — create group, add expense, equal/share/exact splits, balances, IndexedDB persistence.
3. **P2P sync** — Yjs doc per group, y-webrtc room = code, join via code/QR, presence indicator.
4. **Roles & request/approval** — signed role changes, request inbox, approve→commit.
5. **UPI** — settle-up deep links, per-debtor split buttons, QR generator.
6. **Exports** — Excel, PDF, WhatsApp text, image card.
7. **PWA polish** — manifest, icons, install prompt, offline page, iframe-guarded SW.
8. **Drive backup** — OAuth, encrypted snapshot upload/restore.

## 8. Known limits (honest)

- iOS Safari: WebRTC works but background sync stops when tab is closed → user must open app to sync.
- UPI deep links only fire on devices with a UPI app installed (Android-strong, iOS works if app is installed).
- Public WebRTC signaling servers occasionally go down; we'll list 2–3 fallbacks.
- Browsers cannot read SMS/UPI notifications automatically → "auto-import GPay messages" is **not** feasible in a pure PWA. Would require the Capacitor native wrap + Android SMS permission.

Approve this and I'll start with phase 1 (design system + shell) and phase 2 (local groups & expenses), then layer in P2P sync. if possible intergate all the pahses one by one.