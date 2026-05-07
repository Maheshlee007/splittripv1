# Plan — Balances UPI flow, sync fixes, security hardening, UX polish

## Scope (from your latest answers + earlier list)

1. **Balances card** — replace "Got it" with **Mark as paid** for members; on click, send a *payment-claim* (settlement request) to owner. Owner sees it in **Requests** tab and can **Approve full / Approve partial (with amount) / Reject**. Approved/partial amounts only affect Balances (do **not** mutate Dashboard total spent). Add **Pay via UPI** + **QR** buttons in the per-member rows too (not only the top "you owe" card).
2. **Archived trip → disconnect sync**: when a trip is archived, immediately unsubscribe from MQTT and tear down all RTCPeerConnections for it. (Already partially done — verify and harden.)
3. **Layout width**: audit `max-w-3xl` containers; switch to a responsive `max-w-5xl` / `xl:max-w-6xl` so desktop/tablet doesn't waste space. Keep mobile unchanged.
4. **Mobile tab bar overlap** (Expenses/Balances/etc.): make tab list horizontally scrollable with proper spacing; ensure the FAB (+) does not cover daily-breakdown content (add bottom padding `pb-24` to scroll containers).
5. **Activity view** — on `md+` screens render as two columns (left = system events, right = expense events) **or** chat-style grouped by day with avatars. On mobile keep single column.
6. **MQTT signaling not connecting** — investigate `src/lib/sync.ts`. Likely causes: HiveMQ public broker `wss://broker.hivemq.com:8884/mqtt` requires `username/password` empty but specific clientId; topic case mismatch; or `mqtt` browser bundle issue with Vite. Fix by:
   - Switching to `mqtt/dist/mqtt.min.js` browser build or `paho-mqtt`.
   - Adding reconnect logic with exponential backoff and surfaced status to UI ("connecting / online / offline / error").
   - Logging handshake offers/answers to console behind a `?debug=sync` flag.
7. **Unique URL share token** (separate from trip code): generate a random 22-char `nanoid` token per trip, stored as `group.inviteToken`. Share URLs use this token — not the human trip code. Owner can **regenerate** to invalidate old links. Resolves to trip code only when scanned/opened. Works for both owner-shared and member-shared invites.
8. **Leave trip flow**: member taps "Leave trip" → `requestLeave` flag set → owner sees in Requests → on approve, owner removes member, broadcasts a `kick` signaling event so the leaving peer also closes its RTCPeerConnection and unsubscribes locally.
9. **Members tab** — for owner/admin, show a **Role toggle** (segmented control: `member | admin`) per row; owner row is locked. Persists via existing `setMemberRole`.

## Security fixes (4 findings)

| Finding | Fix |
|---|---|
| **p2p_role_spoofing** | In `mergeGroups`, compute `role` and `status` from local member if it exists; only fall back to remote when member is new. `ownerId` already protected — also lock `archived`, `archivedAt`, `budget` to local-owner-only changes. |
| **mqtt_ip_leakage** | (a) Topic = `splittrip/{sha256(code).slice(0,16)}/signal`; (b) AES key = HKDF-SHA256(code, salt=`'splittrip-mqtt-v1'`, info=`'aes-key'`); (c) Set `iceTransportPolicy: 'all'` but filter out `host` candidates from outgoing ICE so LAN IPs never go on the wire. (No TURN server needed — `srflx`/`relay` only would require TURN; we keep `srflx` but drop `host` — best privacy/no-infra balance.) |
| **p2p_snapshot_validation** | Add `src/lib/schema.ts` with `zod` schemas: `MemberSchema`, `ExpenseSchema` (amount > 0, finite, < 1e9; description ≤ 500; note ≤ 1000; billImage ≤ 2 MB), `GroupSchema`. Validate every snapshot in `handleSnapshot` before invoking listeners. Drop invalid snapshots with a warn log. |
| **import_no_schema** | Reuse `GroupSchema` / new `BackupSchema` in `importJSON` and `restoreBackup`. Reject on parse failure with a toast. |

## Technical notes

- New file: `src/lib/schema.ts` (zod schemas + safeParse helpers).
- New file: `src/lib/crypto.ts` — `deriveMqttKey(code)` and `hashedTopic(code)` using WebCrypto `subtle.digest` + HKDF (or simple `sha256` + `pbkdf2` from `crypto-js` already in deps).
- `src/lib/sync.ts`:
  - Use derived topic + key.
  - Filter outgoing ICE candidates (`if (candidate.candidate.includes(' typ host ')) skip`).
  - Add `disconnect(groupId)` already exists — call it from `archiveTrip` in store.
  - Add `kickPeer(groupId, memberId)` to send a control message and tear down on receiver.
  - Add reconnect with backoff + visible status events.
- `src/lib/types.ts`: add `inviteToken?: string` on Group, add `PaymentClaim` type (or reuse `Settlement` with `status: 'pending' | 'approved' | 'partial' | 'rejected'` and `claimedAmount` / `approvedAmount`).
- `src/store/AppStore.tsx`:
  - `mergeGroups` member merge: `{ ...y, ...x, role: x.role ?? y.role, status: x.status ?? y.status }` (local wins for role/status when local exists).
  - Add `claimSettlement`, `approveClaim(claimId, amount)`, `rejectClaim`.
  - `archiveTrip` → call `sync.disconnect(groupId)`.
  - `setMemberRole`, `requestLeave`, `approveLeave` (kick + remove).
  - Generate `inviteToken` via `nanoid` on group create + `regenerateInviteToken`.
- `src/components/BalancesView.tsx`: add UPI + QR + Mark-paid buttons per row; "Mark paid" creates a pending claim instead of an immediate settlement; show "awaiting verification" badge.
- `src/components/RequestsList.tsx`: new section for payment claims with approve full / partial input / reject.
- `src/components/MembersList.tsx`: role segmented control + "Leave trip" button for non-owner self.
- `src/components/ActivityView.tsx`: responsive 2-column on `md+`.
- `src/pages/GroupPage.tsx`: widen container (`max-w-5xl xl:max-w-6xl`), horizontally scrollable Tabs on mobile, `pb-24` on scroll area.
- `src/pages/Index.tsx` / router: handle `?invite=<token>` to resolve token → trip code.
- `src/components/QRHandshakeDialog.tsx`: add "Copy link" + "Share link" buttons (uses `navigator.share` when available); ensure both owner and joining member can initiate.

## Execution order

1. Schemas + crypto helpers (security foundation).
2. `sync.ts` rewrite: hashed topic, derived key, host-ICE filter, reconnect+status, snapshot validation, kick control message.
3. Store: role-locked merge, invite token, claims, leave flow, archive disconnect.
4. UI: BalancesView, RequestsList, MembersList, ActivityView, GroupPage layout, QR dialog link sharing.
5. Validate `importJSON` / `restoreBackup`.
6. Manual verification: open two preview windows; confirm `connecting → online · 1 peer`; archive → goes offline; mark-paid → owner sees claim → approve partial → balance updates correctly.

## Out of scope (for this pass)

- Cryptographic signing of role assertions (deferred — local-wins merge is sufficient).
- Switching to a private MQTT broker (deferred — derived key + topic + host-ICE filtering is the chosen mitigation).
- TURN server provisioning.
