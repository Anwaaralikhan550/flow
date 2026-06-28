import "dotenv/config";
import path from "path";
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import {
  detectExtensionIds,
  extractAndPushCookies,
  rotateAccount,
  checkAndHealTab2,
  type AccountEntry,
  type Tab2Ref,
} from "./automation-logic.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL ?? "https://api.vidgen.fun";
const PORTAL_URL =
  process.env.PORTAL_URL ?? "https://flowcreatorai.site/dashboard";
const FLOW_URL = "https://labs.google/fx/tools/flow";
const ROTATION_MS = Number(process.env.ROTATION_INTERVAL_MS ?? 120_000);
const HEALTH_CHECK_MS = Number(
  process.env.TAB2_HEALTH_CHECK_INTERVAL_MS ?? 30_000,
);

const ADMIN_2_EXT_PATH = path.resolve(
  process.env.ADMIN_2_EXT_PATH ?? "../extensions/admin-2-ext",
);
const KEEPER_EXT_PATH = path.resolve(
  process.env.KEEPER_EXT_PATH ?? "../extensions/admin-keeper-ext",
);
const USER_DATA_DIR = path.resolve("./sessions/keeper-profile");
const ACCOUNTS_PATH = path.resolve("./accounts.json");

// ---------------------------------------------------------------------------
// Load accounts
// ---------------------------------------------------------------------------

function loadAccounts(): Map<string, AccountEntry> {
  if (!existsSync(ACCOUNTS_PATH)) {
    throw new Error(`accounts.json not found at ${ACCOUNTS_PATH}`);
  }

  const raw = readFileSync(ACCOUNTS_PATH, "utf-8");
  const entries: AccountEntry[] = JSON.parse(raw);

  const map = new Map<string, AccountEntry>();
  for (const entry of entries) {
    map.set(entry.masterAccountId, entry);
  }

  console.log(`[keeper] Loaded ${map.size} account(s) from accounts.json`);
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const accounts = loadAccounts();

  const proxyArgs: string[] = [];
  if (process.env.PROXY_SERVER) {
    proxyArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
  }

  console.log("[keeper] Launching persistent Chromium context...");
  console.log(`[keeper]   userDataDir : ${USER_DATA_DIR}`);
  console.log(`[keeper]   admin-2-ext : ${ADMIN_2_EXT_PATH}`);
  console.log(`[keeper]   keeper-ext  : ${KEEPER_EXT_PATH}`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: process.env.HEADLESS !== "false",
    args: [
      "--headless=new",
      "--disable-gpu",
      "--blink-settings=imagesEnabled=false",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--disable-extensions-except=${ADMIN_2_EXT_PATH},${KEEPER_EXT_PATH}`,
      `--load-extension=${ADMIN_2_EXT_PATH},${KEEPER_EXT_PATH}`,
      ...proxyArgs,
    ],
    ...(process.env.PROXY_SERVER
      ? {
          proxy: {
            server: process.env.PROXY_SERVER,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD,
          },
        }
      : {}),
  });

  // Authenticate proxy if credentials provided
  if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    await context.route("**/*", (route) => route.continue());
  }

  // Detect extension IDs (polls until both SWs registered)
  const extIds = await detectExtensionIds(context);

  // Tab 1 — persistent context always opens with one page already created
  const pages = context.pages();
  const tab1 = pages[0] ?? (await context.newPage());
  console.log(`[keeper] Navigating Tab 1 → ${PORTAL_URL}`);
  await tab1.goto(PORTAL_URL, { waitUntil: "domcontentloaded" }).catch((err) =>
    console.warn("[keeper] Tab 1 initial navigation warn:", err.message),
  );

  // Tab 2 — Google Flow page
  const tab2 = await context.newPage();
  console.log(`[keeper] Navigating Tab 2 → ${FLOW_URL}`);
  await tab2.goto(FLOW_URL, { waitUntil: "domcontentloaded" }).catch((err) =>
    console.warn("[keeper] Tab 2 initial navigation warn:", err.message),
  );

  const tab2Ref: Tab2Ref = { current: tab2 };

  console.log(
    `[keeper] Ready. Rotation every ${ROTATION_MS / 1000}s, health-check every ${HEALTH_CHECK_MS / 1000}s`,
  );

  // ---------------------------------------------------------------------------
  // Rotation loop
  // ---------------------------------------------------------------------------

  const runRotation = async () => {
    try {
      await rotateAccount(context, extIds, accounts, BACKEND_URL);
    } catch (err) {
      console.error("[keeper] Rotation error (skipping cycle):", err);
    }
  };

  // Run once immediately, then on interval
  await runRotation();
  setInterval(() => void runRotation(), ROTATION_MS);

  // ---------------------------------------------------------------------------
  // Tab 2 health monitor
  // ---------------------------------------------------------------------------

  setInterval(() => {
    void checkAndHealTab2(context, tab2Ref, tab1).catch((err) =>
      console.error("[keeper] Health-check error:", err),
    );
  }, HEALTH_CHECK_MS);

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // ---------------------------------------------------------------------------

  process.on("SIGINT", async () => {
    console.log("[keeper] SIGINT received — shutting down gracefully");
    await context.close().catch(() => {});
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("[keeper] SIGTERM received — shutting down gracefully");
    await context.close().catch(() => {});
    process.exit(0);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[keeper] Unhandled rejection (process continues):", reason);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[keeper] Fatal startup error:", err);
  process.exit(1);
});
