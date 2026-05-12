/**
 * Playwright E2E test: Two-browser WebRTC peer connection flow
 * 
 * Tests:
 * 1. Host creates a trip
 * 2. Member joins via constructed URL
 * 3. WebRTC connects
 * 4. Host approves member
 * 5. Member sees approval
 * 6. Trip name preserved
 *
 * Run: node test-peer.mjs
 */

import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const EMULATOR = "http://127.0.0.1:8080";

async function clearFirestore() {
  await fetch(`${EMULATOR}/emulator/v1/projects/splittrip-p2p/databases/(default)/documents`, { method: "DELETE" });
}

async function getFirestoreDocs(path) {
  const res = await fetch(`${EMULATOR}/v1/projects/splittrip-p2p/databases/(default)/documents/${path}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("🧹 Clearing Firestore emulator...");
  await clearFirestore();

  const browser = await chromium.launch({ headless: true });
  const hostCtx = await browser.newContext();
  const memberCtx = await browser.newContext();

  const hostPage = await hostCtx.newPage();
  const memberPage = await memberCtx.newPage();

  // Log WebRTC messages
  hostPage.on("console", msg => {
    if (msg.text().includes("[WebRTC]")) console.log(`  [HOST] ${msg.text()}`);
  });
  memberPage.on("console", msg => {
    if (msg.text().includes("[WebRTC]")) console.log(`  [MEMBER] ${msg.text()}`);
  });

  try {
    // ===== STEP 1: Host sets up profile =====
    console.log("\n📋 Step 1: Host sets up profile...");
    await hostPage.goto(BASE);
    await hostPage.waitForLoadState("networkidle");

    // ProfileSetupDialog appears if no name set
    const profileDialog = hostPage.locator('[role="dialog"]');
    if (await profileDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Setting up host profile...");
      await profileDialog.locator('input[placeholder="e.g. Karthik"]').fill("HostUser");
      await profileDialog.locator('button:has-text("Save")').click();
      await sleep(1000);
    }

    // ===== STEP 2: Host creates a trip =====
    console.log("\n📋 Step 2: Host creates trip...");
    // Click "New" button in header — this opens ProfileSetupDialog first if no profile
    await hostPage.locator('button:has-text("New")').click();
    await sleep(500);

    // If profile dialog appeared again (from profileGate flow), fill it
    const profileDialog2 = hostPage.locator('[role="dialog"]');
    const dialogTitle = await profileDialog2.locator('[class*="title"], h2, h3').first().textContent().catch(() => '');
    if (dialogTitle.includes('profile') || dialogTitle.includes('Profile')) {
      console.log("  Profile gate dialog appeared, filling...");
      await profileDialog2.locator('input[placeholder="e.g. Karthik"]').fill("HostUser");
      await profileDialog2.locator('button:has-text("Save")').click();
      await sleep(1000);
    }

    // Now the create trip dialog should be open
    const createDialog = hostPage.locator('[role="dialog"]');
    await createDialog.waitFor({ timeout: 5000 });

    // Fill trip name — try multiple possible input selectors
    const tripNameInput = createDialog.locator('input[placeholder="Goa weekend"], input[type="text"]').first();
    await tripNameInput.waitFor({ timeout: 5000 });
    await tripNameInput.fill("Test Beach Trip");
    await sleep(300);

    // Click "Create trip" button
    await createDialog.locator('button:has-text("Create trip")').click();
    await sleep(1500);

    // Now on the group page
    const hostUrl = hostPage.url();
    console.log("  Host URL:", hostUrl);

    // Extract trip data from localStorage or IndexedDB
    let info = await hostPage.evaluate(async () => {
      // Try localStorage first
      try {
        const stored = localStorage.getItem('splittrip-groups');
        if (stored) {
          const groups = JSON.parse(stored);
          if (groups.length > 0) {
            const g = groups[0];
            return { id: g.id, name: g.name, inviteToken: g.inviteToken, ownerId: g.ownerId };
          }
        }
      } catch {}
      // Try IndexedDB
      return new Promise((resolve) => {
        const req = indexedDB.open("splittrip");
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) { resolve(null); return; }
          const tx = db.transaction(storeNames[0], "readonly");
          const store = tx.objectStore(storeNames[0]);
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const groups = getAll.result;
            if (groups.length > 0) {
              const g = groups[0];
              resolve({ id: g.id, name: g.name, inviteToken: g.inviteToken, ownerId: g.ownerId });
            } else resolve(null);
          };
          getAll.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    });

    if (!info) {
      console.log("  ❌ Could not find trip data!");
      return;
    }
    console.log("  Trip: id=" + info.id + " name=" + info.name + " token=" + (info.inviteToken || "none").substring(0, 8) + "...");

    // Wait for host to register in Firestore
    await sleep(2000);
    const trips = await getFirestoreDocs("trips");
    console.log("  Firestore trips:", JSON.stringify(trips.documents?.map(d => d.name.split("/").pop()) || "none"));

    // ===== STEP 3: Member sets up profile and joins =====
    console.log("\n📋 Step 3: Member joins via URL...");
    const joinUrl = `${BASE}/?trip=${info.id}&code=${info.inviteToken || ''}`;
    console.log("  Join URL:", joinUrl);

    await memberPage.goto(joinUrl);
    await memberPage.waitForLoadState("networkidle");
    await sleep(1000);

    // Debug: what does the member page show?
    const memberUrl1 = memberPage.url();
    const memberBody = await memberPage.evaluate(() => document.body.innerText.substring(0, 300));
    console.log("  Member URL:", memberUrl1);
    console.log("  Member body:", memberBody.replace(/\n/g, " | ").substring(0, 200));

    // Member profile setup - check with longer timeout
    const memberProfileDialog = memberPage.locator('[role="dialog"]');
    if (await memberProfileDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log("  Setting up member profile...");
      await memberProfileDialog.locator('input[placeholder="e.g. Karthik"]').fill("MemberUser");
      await memberProfileDialog.locator('button:has-text("Save")').click();
      await sleep(2000);
      // After profile save + profileGate join, should navigate to trip page
      const memberUrl2 = memberPage.url();
      console.log("  Member URL after profile:", memberUrl2);
    } else {
      console.log("  ⚠️ No profile dialog found on member page");
    }

    // ===== STEP 4: Wait for WebRTC connection =====
    console.log("\n📋 Step 4: Waiting for WebRTC connection...");

    for (let i = 0; i < 20; i++) {
      await sleep(1000);

      // Check Firestore peers
      const peers = await getFirestoreDocs(`trips/${info.id}/peers`);
      const peerDocs = peers.documents || [];

      // Check member page state
      const memberState = await memberPage.evaluate(() => {
        const bodyText = document.body.textContent || '';
        if (bodyText.includes('Waiting for the trip owner to approve')) return 'pending-banner';
        if (bodyText.includes('Establishing Secure Peer')) return 'waiting-room';
        if (bodyText.includes('Total spent')) return 'in-trip';
        return 'unknown';
      });

      // Check host page connection status
      const hostConnected = await hostPage.evaluate(() => {
        const el = document.querySelector('.text-success');
        return !!el;
      });

      const peerInfo = peerDocs.map(d => ({
        id: d.name.split("/").pop(),
        offer: !!d.fields?.offer,
        answer: !!d.fields?.answer
      }));

      console.log(`  [${i+1}s] Member: ${memberState}, Host connected: ${hostConnected}, Peers: ${JSON.stringify(peerInfo)}`);

      if (memberState === 'pending-banner' || memberState === 'in-trip') {
        console.log("  ✅ Member connected and past waiting room!");
        break;
      }
    }

    // ===== STEP 5: Host approves member =====
    console.log("\n📋 Step 5: Host approves member...");

    // Go to Members tab
    const membersTab = hostPage.locator('[role="tab"]:has-text("Members")').first();
    if (await membersTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await membersTab.click();
      await sleep(500);
    }

    // Look for pending member and approve
    const approveBtn = hostPage.locator('button:has-text("Approve")').first();
    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Found approve button, clicking...");
      await approveBtn.click();
      await sleep(2000);
      console.log("  ✅ Member approved!");
    } else {
      console.log("  ⚠️ No approve button visible");
      // Check if member is already showing
      const membersText = await hostPage.locator('[role="tabpanel"]').textContent().catch(() => "");
      console.log("  Members panel:", membersText?.substring(0, 200));
    }

    // ===== STEP 6: Check member sees approval =====
    console.log("\n📋 Step 6: Checking member sees approval...");
    await sleep(2000);

    const memberSeesPending = await memberPage.evaluate(() => {
      return document.body.textContent?.includes("Waiting for the trip owner to approve") || false;
    });

    if (memberSeesPending) {
      console.log("  ❌ Member STILL sees pending banner!");
    } else {
      console.log("  ✅ Member no longer sees pending banner!");
    }

    // ===== STEP 7: Check trip name =====
    console.log("\n📋 Step 7: Checking trip name...");

    const hostTripName = await hostPage.evaluate(async () => {
      try {
        const stored = localStorage.getItem('splittrip-groups');
        if (stored) { const g = JSON.parse(stored); if (g.length > 0) return g[0]?.name; }
      } catch {}
      // Try IDB
      return new Promise(r => {
        const req = indexedDB.open("splittrip");
        req.onsuccess = () => {
          const db = req.result;
          const names = Array.from(db.objectStoreNames);
          if (!names.length) { r('unknown-noidb'); return; }
          const tx = db.transaction(names[0], "readonly");
          const getAll = tx.objectStore(names[0]).getAll();
          getAll.onsuccess = () => r(getAll.result?.[0]?.name || 'unknown-empty');
          getAll.onerror = () => r('unknown-err');
        };
        req.onerror = () => r('unknown-noopen');
      });
    });

    const memberTripName = await memberPage.evaluate(async () => {
      try {
        const stored = localStorage.getItem('splittrip-groups');
        if (stored) { const g = JSON.parse(stored); if (g.length > 0) return g[0]?.name; }
      } catch {}
      return new Promise(r => {
        const req = indexedDB.open("splittrip");
        req.onsuccess = () => {
          const db = req.result;
          const names = Array.from(db.objectStoreNames);
          if (!names.length) { r('unknown-noidb'); return; }
          const tx = db.transaction(names[0], "readonly");
          const getAll = tx.objectStore(names[0]).getAll();
          getAll.onsuccess = () => r(getAll.result?.[0]?.name || 'unknown-empty');
          getAll.onerror = () => r('unknown-err');
        };
        req.onerror = () => r('unknown-noopen');
      });
    });

    console.log(`  Host trip name: "${hostTripName}"`);
    console.log(`  Member trip name: "${memberTripName}"`);

    const nameOk = hostTripName === "Test Beach Trip" && memberTripName === "Test Beach Trip";
    console.log(nameOk ? "  ✅ Trip name preserved on both sides!" : "  ❌ Trip name issue detected");

    // ========== SUMMARY ==========
    console.log("\n========== TEST SUMMARY ==========");
    console.log(`Trip name host:   "${hostTripName}" ${hostTripName === "Test Beach Trip" ? "✅" : "❌"}`);
    console.log(`Trip name member: "${memberTripName}" ${memberTripName === "Test Beach Trip" ? "✅" : "❌"}`);
    console.log(`Member pending:   ${memberSeesPending ? "YES ❌" : "NO ✅"}`);

  } catch (e) {
    console.error("\n❌ Test error:", e.message);
    console.error(e.stack);
  } finally {
    await hostCtx.close();
    await memberCtx.close();
    await browser.close();
    console.log("\n🏁 Test complete.");
  }
}

main().catch(console.error);
