import type { BrowserContext, Page, Cookie } from "playwright";
import { pushCookies } from "./cookie-pusher.js";

export interface AccountEntry {
  masterAccountId: string;
  keeperKey: string;
  setupCode: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

export interface ExtensionIds {
  admin2Id: string;
  keeperId: string;
}

export interface Tab2Ref {
  current: Page;
}

const COOKIE_URLS = ["https://labs.google/", "https://labs.google.com/"];
const REQUIRED_COOKIE = "__Secure-next-auth.session-token";
const ACTIVE_LEASE_KEY =
  process.env.ACTIVE_LEASE_STORAGE_KEY ?? "activeLease";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polls context.serviceWorkers() until both extension SWs are registered.
 * Matches by URL path fragments from the known extension backgrounds:
 *   admin-2-ext  → contains "service-worker.js"
 *   admin-keeper-ext → contains "background.js" (and NOT "service-worker")
 * Env overrides: ADMIN_2_EXT_ID, KEEPER_EXT_ID
 */
export async function detectExtensionIds(
  context: BrowserContext,
): Promise<ExtensionIds> {
  const envAdmin2 = process.env.ADMIN_2_EXT_ID;
  const envKeeper = process.env.KEEPER_EXT_ID;

  if (envAdmin2 && envKeeper) {
    console.log(
      `[keeper] Extension IDs from env: admin2=${envAdmin2} keeper=${envKeeper}`,
    );
    return { admin2Id: envAdmin2, keeperId: envKeeper };
  }

  console.log("[keeper] Auto-detecting extension IDs from service workers...");

  for (let attempt = 0; attempt < 20; attempt++) {
    const workers = context.serviceWorkers();

    if (workers.length >= 2) {
      let admin2Id: string | null = envAdmin2 ?? null;
      let keeperId: string | null = envKeeper ?? null;

      for (const worker of workers) {
        const url = worker.url();
        const match = url.match(/chrome-extension:\/\/([^/]+)/);
        if (!match) continue;
        const extId = match[1];

        if (!admin2Id && url.includes("service-worker.js")) {
          admin2Id = extId;
        } else if (!keeperId && url.includes("background.js") && !url.includes("service-worker")) {
          keeperId = extId;
        }
      }

      if (admin2Id && keeperId) {
        console.log(
          `[keeper] Detected: admin2=${admin2Id} keeper=${keeperId}`,
        );
        return { admin2Id, keeperId };
      }

      console.warn(
        `[keeper] Found ${workers.length} SWs but could not match both extensions. URLs: ${workers.map((w) => w.url()).join(" | ")}`,
      );
    }

    await sleep(500);
  }

  throw new Error(
    "[keeper] Extension service workers not detected within 10s. " +
      "Set ADMIN_2_EXT_ID and KEEPER_EXT_ID env vars to bypass auto-detection.",
  );
}

/**
 * Injects apiBaseUrl + masterAccountId + keeperKey directly into
 * admin-keeper-ext chrome.storage.local — bypasses popup UI to avoid
 * popup-closes-on-blur issues.
 */
async function injectKeeperExtStorage(
  context: BrowserContext,
  keeperExtId: string,
  backendUrl: string,
  entry: AccountEntry,
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${keeperExtId}/popup.html`, {
      waitUntil: "domcontentloaded",
      timeout: 8_000,
    });

    await page.evaluate(
      async (data: { apiBaseUrl: string; masterAccountId: string; keeperKey: string }) => {
        return new Promise<void>((resolve) =>
          chrome.storage.local.set(data, resolve),
        );
      },
      {
        apiBaseUrl: backendUrl,
        masterAccountId: entry.masterAccountId,
        keeperKey: entry.keeperKey,
      },
    );

    console.log(
      `[keeper] Injected keeper-ext storage for ${entry.masterAccountId}`,
    );
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Extracts cookies from Google Flow domains and pushes to backend.
 * Validates __Secure-next-auth.session-token is present before pushing.
 */
export async function extractAndPushCookies(
  context: BrowserContext,
  backendUrl: string,
  entry: AccountEntry,
): Promise<void> {
  const cookies: Cookie[] = await context.cookies(COOKIE_URLS);

  const hasSessionToken = cookies.some((c) => c.name === REQUIRED_COOKIE);
  if (!hasSessionToken) {
    console.warn(
      `[keeper] ${REQUIRED_COOKIE} not found for ${entry.masterAccountId} — skipping push`,
    );
    return;
  }

  await pushCookies(backendUrl, entry.masterAccountId, entry.keeperKey, cookies);
}

/**
 * Main rotation step:
 * 1. Open admin-2-ext popup in temp tab
 * 2. Click Re-inject Session button
 * 3. Read activeLease from extension session storage
 * 4. Look up accounts map → inject keeper-ext storage → push cookies
 */
export async function rotateAccount(
  context: BrowserContext,
  extIds: ExtensionIds,
  accountsMap: Map<string, AccountEntry>,
  backendUrl: string,
): Promise<void> {
  const selector =
    process.env.REINJECT_BUTTON_SELECTOR ?? "#reInjectBtn";

  const extPage = await context.newPage();
  let masterAccountId: string | null = null;

  try {
    await extPage.goto(
      `chrome-extension://${extIds.admin2Id}/popup.html`,
      { waitUntil: "domcontentloaded", timeout: 8_000 },
    );

    await extPage.waitForSelector(selector, { timeout: 8_000 });
    await extPage.click(selector);

    // Wait for extension to settle and write activeLease to session storage
    await sleep(3_000);

    const activeLease = await extPage.evaluate(
      async (key: string) =>
        new Promise<Record<string, unknown> | null>((resolve) =>
          chrome.storage.session.get([key], (result) =>
            resolve((result[key] as Record<string, unknown>) ?? null),
          ),
        ),
      ACTIVE_LEASE_KEY,
    );

    masterAccountId =
      (activeLease?.masterAccountId as string | undefined) ?? null;
  } finally {
    await extPage.close().catch(() => {});
  }

  if (!masterAccountId) {
    console.warn(
      "[keeper] No activeLease.masterAccountId after rotation — skipping cycle",
    );
    return;
  }

  const entry = accountsMap.get(masterAccountId);
  if (!entry) {
    console.warn(
      `[keeper] masterAccountId ${masterAccountId} not found in accounts.json — skipping`,
    );
    return;
  }

  await injectKeeperExtStorage(context, extIds.keeperId, backendUrl, entry);
  await extractAndPushCookies(context, backendUrl, entry);
}

/**
 * Health check for Tab 2. Returns the (possibly replaced) Tab 2 page.
 * Self-heals by clicking GENERATE_VIDEO_SELECTOR on Tab 1 and capturing
 * the newly opened tab as the fresh Tab 2.
 */
export async function checkAndHealTab2(
  context: BrowserContext,
  tab2Ref: Tab2Ref,
  tab1: Page,
): Promise<void> {
  const tab2 = tab2Ref.current;
  let broken = false;

  if (tab2.isClosed()) {
    broken = true;
  } else {
    try {
      await tab2.evaluate(() => document.readyState);
    } catch {
      broken = true;
    }
  }

  if (!broken) return;

  console.warn("[keeper] Tab 2 is broken — initiating self-heal");

  await tab2.close().catch(() => {});

  try {
    await tab1.bringToFront();

    const generateSelector =
      process.env.GENERATE_VIDEO_SELECTOR ?? "#generate-video-btn";

    const [newTab] = await Promise.all([
      context.waitForEvent("page", { timeout: 15_000 }),
      tab1.click(generateSelector, { timeout: 10_000 }),
    ]);

    await newTab.waitForLoadState("domcontentloaded");
    tab2Ref.current = newTab;
    console.log(
      `[keeper] Self-heal complete — new Tab 2: ${newTab.url()}`,
    );
  } catch (err) {
    console.error("[keeper] Self-heal failed:", err);
    // Leave tab2Ref.current as closed page — next health check will retry
  }
}
