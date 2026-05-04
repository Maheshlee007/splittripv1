# SplitTrip — Sync overhaul + UX polish

## Priority 1 — Fix peer connectivity (verify before continuing)

**Problem:** `y-webrtc` signaling servers are unreliable; status stays "offline".

**Fix:**

1. Replace `y-webrtc` signaling stack with **PeerJS** (`peerjs` lib) which ships its own free public broker (`0.peerjs.com`). We keep Yjs as the CRDT, but transport awareness/sync messages through a thin PeerJS data-channel adapter (`src/lib/sync.ts`).
2. Iterate STUN servers on failure: `stun.l.google.com:19302`, `stun1..stun4.l.google.com:19302`. Pass all 5 in `iceServers`; PeerJS/WebRTC tries them in order automatically.
3. Add reconnect/backoff: if broker disconnects, retry every 3s up to 5 attempts, then surface "offline" with a "Retry" button in the header chip.
4. **QR handshake fallback** (manual offer/answer):
  - New "Connect via QR" dialog in trip Share modal.
  - Owner generates SDP offer → compress with `lz-string` → render as QR.
  - Joiner scans (camera via `@zxing/browser`) → produces answer QR → owner scans → channel up.
  - Once connected, full Yjs snapshot syncs automatically.
5. **Verify:** open two browser windows, confirm peer count goes ≥1, and balances replicate.
6. integrate a QR code scanner in the application to scan the code  or data directly via application, url+ data, via application it wll take that query param, if scanned via google lens lunches appliction and reads the param and proceed with connecting.
7. if anyone leaves the group that connection should be closed.

## Priority 2 — Backup, restore, onboarding hint

- **Me/Settings page**: add "Export all data (JSON)" + "Import data (JSON)" — full dump of profile + groups from IndexedDB.
- After first profile creation, show a one-time toast/banner: *"Take a JSON backup before clearing app data — Settings → Export."*
- Add optional **Firebase / Supabase signaling fallback** fields in Profile (URL + token). When set, used as extra Yjs signaling server. Empty = ignored.

## Priority 3 — Expense flow UX

- Members (non-admin) currently have no FAB → re-enable: any active member can press `+`; admins add directly, members submit a request (already wired in `submitRequest`). Hide only when `selfPending` or trip archived.
- Make `ExpenseDialog` responsive:
  - Desktop ≥md: 2-column grid (left: amount/desc/category, right: split editor). ≥xl: 3-col with summary panel.
  - Mobile: single column.
  - Category row: horizontal scroll chips with snap.
  - Split list: fixed-height scroll area with each member as a tappable badge (toggle include/exclude), value input inline.
  - "Paid by" select: fixed width + internal scroll for long names.
  - exporting in mobile for pdf view  or image whihc is generated in not working in mobile so fix that.
  - &nbsp;

## Priority 4 — Balances & dashboard polish

- Balances tab: instead of per-pair UPI buttons, compute **net amount each member owes the owner** and show one consolidated "Pay owner" QR/UPI button using owner's VPA. Owner sees a "Collect" view with per-member amounts .
- consider if a memeber spent 6000, but trip cost per person is 4000, then owner have to pay to them, if upiid set show the qr else just show the value.
- Dashboard: rename "Daily breakdown" → "Trip breakdown"; remove the "Total paid" row.
- Fix overlap: Members tab content collides with Requests; add bottom padding for FAB area (`pb-28`). Move FAB so it doesn't cover dashboard last row.
- **Archived trips section** on TripsPage: split list into "Active" and "Archived" (collapsible).

## Technical details

- Add deps: `peerjs`, `lz-string`, `@zxing/browser`, `qrcode` (already used),qr code reader or scanner.
- New files: `src/lib/sync-peerjs.ts` (replace `sync.ts`), `src/components/QRHandshakeDialog.tsx`, `src/components/BackupRestore.tsx`, `src/lib/backup.ts`.
- `AppStore` unchanged externally; update sync wiring only.
- Status pill states: `connected | broker | qr | offline` with click-to-retry.

## Verification

After P1 implementation: open two preview tabs in same trip → expect "connected · 1 peer". If broker fails, surface QR dialog; complete handshake → same state. Only after this works do P2–P4 ship. i'll do the verificatoin u proceed with all the enhnacments

&nbsp;