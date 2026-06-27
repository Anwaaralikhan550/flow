import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Extension lease lifecycle hardening", () => {
  it("keeps compatibility instrumentation out of the production manifest", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    const compatManifest = JSON.parse(readFileSync("extension/manifest.compat-test.json", "utf8"));
    const productionScripts = manifest.content_scripts.flatMap((entry: any) => entry.js);
    const compatScripts = compatManifest.content_scripts.flatMap((entry: any) => entry.js);
    const flowGateEntry = manifest.content_scripts.find((entry: any) => entry.js.includes("content/flow-gate.js"));
    const stealthEntry = compatManifest.content_scripts.find((entry: any) => entry.js.includes("content/env-compat-fixture.js"));

    expect(productionScripts).not.toContain("content/env-compat-fixture.js");
    expect(compatScripts).toContain("content/env-compat-fixture.js");
    expect(flowGateEntry.world).toBe("ISOLATED");
    expect(flowGateEntry.all_frames).not.toBe(true);
    expect(stealthEntry.world).toBe("MAIN");
    expect(stealthEntry.all_frames).toBe(true);
  });

  it("keeps dynamic flow-gate fallback in the same isolated world as the manifest", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");

    expect(source).toContain('files: ["content/flow-gate.js"],');
    expect(source).toContain('world: "ISOLATED"');
  });

  it("releases the backend lease and clears local state when cookie injection fails", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");

    expect(source).toContain("await clearTargetSessionCookies()");
    expect(source).toContain("await injectCookies(response.vaultData)");
    expect(source).toContain("await verifyInjectedSession(response.vaultData)");
    expect(source).toContain("await clearActiveLeaseState()");
    expect(source).toContain("await releaseUsage({ leaseId: response.leaseId, submitted: false })");
    expect(source).toContain("Preparing session, please retry.");
  });

  it("waits for a strong generation signal and reports provider inflight without wiping cookies", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");
    const signalIndex = source.indexOf("hasStrongGenerationSignal(pageText)");
    const releaseIndex = source.indexOf('type: "RELEASE_USAGE", payload: { submitted: true }');

    expect(signalIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(signalIndex);
    expect(source).not.toContain('chrome.runtime.sendMessage({ type: "WIPE_COOKIES" })');
    expect(source).toContain("Generation submitted. Session tracked.");
    expect(source).toContain("keep the live page session");
  });

  it("auto-leases on page load and preserves the user's native generate click", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain("void triggerAutoLease()");
    expect(source).toContain("async function triggerAutoLease()");
    expect(source).toContain("autoLeasePromise = chrome.runtime.sendMessage({ type: \"LEASE_ACCOUNT\" })");
    expect(source).toContain('chrome.runtime.sendMessage({ type: "LEASE_ACCOUNT" })');
    expect(source).toContain("response.result?.unavailable");
    expect(source).toContain("function calculateAutoLeaseRetryDelay(");
    expect(source).toContain("AUTO_LEASE_RETRY_JITTER_MS");
    expect(source).toContain("void triggerAutoLease()");
    expect(source).toContain("Session cookies are injected on page load; the runner's manual click is native.");
    expect(source).toContain("Let this native click propagate unmodified");
    expect(source).not.toContain("replayGenerateClick(");
    expect(source).not.toContain("target.click()");
    expect(source).not.toContain("Click Generate again after lease is active.");
  });

  it("keeps usage reporting retryable until REPORT_USAGE succeeds", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain("generationSignals.reporting");
    expect(source).toContain("attempt < 3");
    expect(source).toContain("generationSignals.reported = true");
    expect(source.indexOf("generationSignals.reported = true")).toBeGreaterThan(source.indexOf("if (response?.ok)"));
  });

  it("does not clear cookies or proxy when release/report only update backend state", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");
    const releaseIndex = source.indexOf("async function releaseUsage");
    const reportIndex = source.indexOf("async function reportUsage");
    const cleanupIndex = source.indexOf("async function clearActiveLeaseState");
    const metadataOnlyIndex = source.indexOf("async function clearLeaseMetadataOnly");

    expect(releaseIndex).toBeGreaterThan(-1);
    expect(reportIndex).toBeGreaterThan(-1);
    expect(metadataOnlyIndex).toBeGreaterThan(-1);
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(source.slice(releaseIndex, cleanupIndex)).toContain("await clearLeaseMetadataOnly()");
    expect(source.slice(reportIndex, source.indexOf("async function openCustomerLink"))).toContain("await clearLeaseMetadataOnly()");
    expect(source.slice(releaseIndex, cleanupIndex)).not.toContain("await clearProxySettings()");
  });

  it("wipes local session material before backend logout revoke", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");
    const logoutStart = source.indexOf("async function logout()");
    const logoutEnd = source.indexOf("async function cleanupIfLoggedOut()");
    const logoutBody = source.slice(logoutStart, logoutEnd);

    expect(logoutStart).toBeGreaterThan(-1);
    expect(logoutEnd).toBeGreaterThan(logoutStart);
    expect(logoutBody.indexOf("await clearTargetSessionCookies().catch")).toBeLessThan(logoutBody.indexOf("/auth/logout"));
    expect(logoutBody.indexOf("await clearProxySettings().catch")).toBeLessThan(logoutBody.indexOf("/auth/logout"));
    expect(logoutBody.indexOf("await chrome.storage.session.remove")).toBeLessThan(logoutBody.indexOf("/auth/logout"));
    expect(logoutBody).toContain("skipRefresh: true");
  });

  it("self-cleans stale cookies and proxy when the extension wakes without a logged-in session", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");

    expect(source).toContain('managedSession: "managedSessionActive"');
    expect(source).toContain("chrome.storage.local.set({ [STORAGE_KEYS.managedSession]: true })");
    expect(source).toContain("cleanupIfLoggedOut().catch(() => undefined)");
    expect(source).toContain("chrome.runtime.onStartup.addListener");
    expect(source).toContain("chrome.runtime.onInstalled.addListener");
    expect(source).toContain("async function cleanupIfLoggedOut()");
    expect(source).toContain("chrome.storage.local.get(STORAGE_KEYS.managedSession)");
    expect(source).toContain("if (!local[STORAGE_KEYS.managedSession])");
    expect(source).toContain("await clearTargetSessionCookies()");
    expect(source).toContain("await clearProxySettings()");
    expect(source).toContain("async function clearManagedSessionMarker()");
  });

  it("removes partitioned target cookies when Chrome returns a partitionKey", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");
    const removeStart = source.indexOf("async function removeCookie(cookie)");
    const removeEnd = source.indexOf("function parseVaultCookies", removeStart);
    const removeBody = source.slice(removeStart, removeEnd);

    expect(removeBody).toContain("if (cookie.partitionKey)");
    expect(removeBody).toContain("details.partitionKey = cookie.partitionKey");
    expect(removeBody).toContain("await chrome.cookies.remove(details)");
  });

  it("only leaves lite lower-priority Veo variants unlocked while locking premium variants", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain("const LOWER_PRIORITY_PATTERN = /lower\\s+priority/i;");
    expect(source).toContain("const LOWER_PRIORITY_MODEL_PATTERN = /\\bveo\\b/i;");
    expect(source).toContain("const LOWER_PRIORITY_TIER_PATTERN = /\\blite\\b/i;");
    expect(source).not.toContain("/^veo 3 lower priority$/i");
    expect(source).toContain("function isLockedModelText(text)");
    expect(source).toContain("LOCKED_MODEL_TEXT_PATTERN.test(text) && !isLowerPriorityExemption(text)");
    expect(source).toContain("function isLowerPriorityExemption(text)");
    expect(source).toContain("LOWER_PRIORITY_MODEL_PATTERN.test(normalized)");
    expect(source).toContain("LOWER_PRIORITY_TIER_PATTERN.test(normalized)");
    expect(source).toContain("LOWER_PRIORITY_PATTERN.test(normalized)");
    expect(source).toContain('String(text ?? "").replace(/\\s+/g, " ").trim().toLowerCase()');

    // Every model-lock decision site must route through the exemption-aware
    // helper, not the raw pattern, so only the explicit low-tier model is unlocked.
    // (2 legitimate raw uses: isLockedModelText itself, and trackModelSelectionClick's
    // cheap "does this text even mention a model" pre-filter before the real check.)
    const rawPatternUses = source.match(/LOCKED_MODEL_TEXT_PATTERN\.test\(/g) ?? [];
    expect(rawPatternUses).toHaveLength(2);
    expect(source).toContain("function trackModelSelectionClick(");
    expect(source).toContain("lastSelectedModelLocked = !isLockedModelText(text)");
    expect(source).toContain("shouldLockModelOptions() && lastSelectedModelLocked");

    expect(source).toContain("if (isLowerPriorityExemption(text)) {\n      return 0;");
  });

  it("reports auth callback failures so stale vaults are removed from rotation", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain("async function detectAuthCallbackIssue()");
    expect(source).toContain('location.pathname.includes("/fx/api/auth/signin")');
    expect(source).toContain('type: "REPORT_USAGE"');
    expect(source).toContain('outcome: "AUTH_INVALID"');
    expect(source).toContain('providerErrorType: "AUTH_CALLBACK"');
    expect(source).toContain("Session is being refreshed. Please retry in a moment.");
  });

  it("renders transient extension UI inside a dedicated shadow root", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain('const UI_HOST_ID = "vidgen-flow-ui-host";');
    expect(source).toContain('uiHost.attachShadow({ mode: "open" })');
    expect(source).toContain("function injectShadowUiStyle()");
    expect(source).toContain("root.appendChild(banner)");
    expect(source).toContain("root.appendChild(badge)");
    expect(source).toContain("root.appendChild(toast)");
    expect(source).toContain("getUiElementById(BANNER_ID)?.remove()");
    expect(source).toContain("getUiElementById(SESSION_BADGE_ID)?.remove()");
  });

  it("shows a dedicated retry banner on account mismatch with a duplicate-lease guard", () => {
    const source = readFileSync("extension/content/flow-gate.js", "utf8");

    expect(source).toContain("function showMismatchBanner()");
    expect(source).toContain("function clearMismatchBanner()");
    expect(source).toContain("BANNER_RETRY_BUTTON_ID");

    const detectStart = source.indexOf("async function detectAuthCallbackIssue()");
    const detectEnd = source.indexOf("function detectGenerationOutcome()");
    expect(source.slice(detectStart, detectEnd)).toContain("showMismatchBanner()");

    const bannerStart = source.indexOf("function showMismatchBanner()");
    const bannerEnd = source.indexOf("function clearMismatchBanner()");
    const bannerBody = source.slice(bannerStart, bannerEnd);
    expect(bannerBody).toContain("if (autoLeasePromise) {");
    expect(bannerBody.indexOf("if (autoLeasePromise) {")).toBeLessThan(bannerBody.indexOf("void triggerAutoLease()"));

    const updateBadgeStart = source.indexOf("function updateSessionBadge()");
    const updateBadgeEnd = source.indexOf("/**", updateBadgeStart + 1);
    expect(source.slice(updateBadgeStart, updateBadgeEnd)).toContain("clearMismatchBanner()");
  });

  it("uses fixed keeper cookie origins instead of the active tab during admin sync", () => {
    const backgroundSource = readFileSync("admin-sync-extension/background.js", "utf8");
    const manifest = JSON.parse(readFileSync("admin-sync-extension/manifest.json", "utf8"));

    expect(backgroundSource).toContain("TRUSTED_COOKIE_URLS");
    expect(backgroundSource).not.toContain("PLATFORM_APEX_DOMAIN");
    expect(backgroundSource).not.toContain("chrome.cookies.getAll({ domain:");
    expect(backgroundSource).toContain("NEXT_AUTH_COOKIE_NAMES");
    expect(backgroundSource).toContain("chrome.cookies.getAll({ url })");
    expect(backgroundSource).not.toContain("tabs.query");
    expect(manifest.permissions).not.toContain("activeTab");
  });

  it("replaces the manual admin-sync fields with a single setup-code flow", () => {
    const popupSource = readFileSync("admin-sync-extension/popup.js", "utf8");
    const popupHtml = readFileSync("admin-sync-extension/popup.html", "utf8");
    const backgroundSource = readFileSync("admin-sync-extension/background.js", "utf8");

    // Old manual fields and flow fully removed
    expect(popupSource).not.toContain("PERSISTED_FIELD_IDS");
    expect(popupSource).not.toContain("adminAccessToken");
    expect(popupSource).not.toContain("adminToken");
    expect(popupSource).not.toContain("/admin/master-accounts/");
    expect(popupSource).not.toContain("method: 'PATCH'");
    expect(popupHtml).not.toContain('id="apiBaseUrl"');
    expect(popupHtml).not.toContain('id="adminAccessToken"');
    expect(popupHtml).not.toContain('id="adminToken"');
    expect(popupHtml).not.toContain('id="syncBtn"');

    // New setup-code decode + apply flow present
    expect(popupSource).toContain("function decodeSetupCode(");
    expect(popupSource).toContain("atob(cleaned)");
    expect(popupSource).toContain("chrome.storage.local.set({");
    expect(popupHtml).toContain('id="setupCode"');
    expect(popupHtml).toContain('id="applySetupBtn"');

    // Avoids the permission-prompt-closes-the-popup MV3 gotcha: only requests at
    // runtime if the origin isn't already covered by manifest host_permissions.
    expect(popupSource).toContain("chrome.permissions.contains({ origins: [pattern] })");
    const manifest = JSON.parse(readFileSync("admin-sync-extension/manifest.json", "utf8"));
    expect(manifest.host_permissions).toContain("https://api.vidgen.fun/*");
    expect(popupHtml).toContain('id="syncNowBtn"');

    // Sync Now reuses background.js's keeper-sync logic via messaging, not a duplicate implementation
    expect(popupSource).toContain("chrome.runtime.sendMessage({ type: 'SYNC_NOW' })");
    expect(backgroundSource).toContain("message?.type === 'SYNC_NOW'");
    expect(backgroundSource).toContain("async function runKeeperSync()");
    expect(popupSource).not.toContain("/keeper-sync");
    expect(popupSource).not.toContain("collectVaultCookies");
  });
});
