# SplitTrip

SplitTrip is a local-first, peer-to-peer expense tracker for group trips and personal expenses.

## Core Features

- Group trip expense splitting with owner/admin/member roles
- Personal expense tracker mode
- Live peer sync via WebRTC + Firebase signaling
- Expense requests and approval workflow
- Advance collection tracking (paid vs not paid)
- PDF / Excel / JSON export
- Backup and restore (JSON)
- PWA install support

## Quick Start

1. Install dependencies:
	`pnpm install`
2. Start dev server:
	`pnpm dev`
3. Open app:
	`http://localhost:3000`

## How to Use

### 1) Create or Join a Trip

- Owner creates a trip and shares trip code/link.
- Members join using code/link.
- Set display name in Me tab before joining for correct peer identity.

### 2) Sync Peers

- Open the same trip on owner + member devices.
- Initial sync starts automatically; Sync button can be used for retry.
- While trip screen is open, heartbeat updates online status.
- If no heartbeat for ~30 seconds, member is shown offline.

### 3) Roles and Approvals

- Owner and admins can approve/reject:
  - join requests
  - expense requests
  - payment claims
- Approval/rejection events are added to Activity and shared to peers.

### 4) Advance Collection

- Add expense with advance collection enabled.
- Mark members who already paid their share.
- Dashboard shows per-member total advance and unpaid status.

### 5) Backup / Restore

- Use Me -> Backup & restore.
- Export JSON before clearing data or switching devices.
- Restore the same profile when possible for smooth ownership continuity.

## Performance Notes (Firebase Free Tier)

- Signaling is scoped to active sync windows.
- Presence is tracked over WebRTC heartbeats when connected (no constant Firestore polling).
- Avoid opening the same trip in many inactive tabs/devices.

## Help Page in App

Use the in-app page:
- Me -> How to Use

It includes concise setup and troubleshooting steps.
