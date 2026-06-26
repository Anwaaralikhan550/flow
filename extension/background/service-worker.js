import { createAuthenticatedFetch } from "./auth-fetch.js";

const DEFAULT_API_BASE_URL = "https://api.vidgen.fun";
const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  token: "accessToken",
  user: "user",
  config: "clientConfig",
  configHash: "configHash",
  dashboard: "dashboard",
  activeLease: "activeLease",
  fingerprint: "fingerprintId",
  // Proxy credentials live in session storage so they are cleared automatically
  // when the browser closes. Never written to persistent local storage.
  proxyCredentials: "activeProxyCredentials"
};
const TARGET_COOKIE_URLS = ["https://labs.google/", "https://labs.google.com/"];
// Confirmed via real-browser testing: session-token alone is sufficient for both
// page load and video generation — csrf-token/callback-url are not load-bearing.
const NEXT_AUTH_COOKIE_NAMES = ["__Secure-next-auth.session-token"];

let leaseAccountPromise = null;

// Enforce WebRTC network privacy immediately on every service worker wake-up.
// MV3 service workers unload and reload between invocations, so top-level code
// re-executes each time the worker wakes — this makes the policy self-healing.
//
// 'disable_non_proxied_udp' is the strictest available policy:
//   - Kills all direct UDP paths (no host/srflx ICE candidates)
//   - Forces TURN-only relay, which must traverse the active proxy container
//   - Prevents the runner's local interface addresses from appearing in WebRTC
//     ICE candidate lists that the target platform could read via the media API
//
// Any weaker policy (e.g. 'default_public_interface_only') still leaks subnet
// addresses through local ICE candidates — only this value closes that path.
enforceWebRtcPrivacy().catch(() => undefined);

// Handles proxy authentication challenges for the active lease's gateway proxy.
// Must be registered at module top-level — MV3 service workers unload between
// invocations, so dynamically-registered listeners would be lost.
// Requires "webRequestAuthProvider" in manifest permissions (Chrome 108+).
if (chrome.webRequest?.onAuthRequired) {
  chrome.webRequest.onAuthRequired.addListener(
    async (details, callback) => {
      // Only intercept proxy auth challenges, not origin server 407s.
      if (!details.isProxy) {
        callback({});
        return;
      }
      const stored = await chrome.storage.session.get(STORAGE_KEYS.proxyCredentials);
      const creds = stored[STORAGE_KEYS.proxyCredentials];
      if (!creds?.username || !creds?.password) {
        callback({});
        return;
      }
      callback({ authCredentials: { username: creds.username, password: creds.password } });
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_STATE":
      return getState();
    case "SET_API_BASE_URL":
      return setApiBaseUrl(message.apiBaseUrl);
    case "LOGIN":
      return login(message.email, message.password);
    case "FETCH_CONFIG":
      return fetchClientConfig();
    case "GET_DASHBOARD":
      return fetchDashboard();
    case "LEASE_ACCOUNT":
      return leaseAccountOnce();
    case "REPORT_USAGE":
      return reportUsage(message.payload);
    case "RELEASE_USAGE":
      return releaseUsage(message.payload);
    case "WIPE_COOKIES":
      return wipeCookies(message.payload);
    case "AUTO_SIGNOUT_DETECTED":
      return handleAutoSignout();
    case "OPEN_CUSTOMER_LINK":
      return openCustomerLink(message.target);
    case "OPEN_FLOW_PAGE":
      return openFlowPage();
    case "LOGOUT":
      return logout();
    default:
      throw new Error("Unknown extension message");
  }
}

async function leaseAccountOnce() {
  if (leaseAccountPromise) {
    return leaseAccountPromise;
  }

  leaseAccountPromise = leaseAccount().finally(() => {
    leaseAccountPromise = null;
  });
  return leaseAccountPromise;
}

async function getState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEYS.apiBaseUrl, STORAGE_KEYS.fingerprint]),
    chrome.storage.session.get([
      STORAGE_KEYS.token,
      STORAGE_KEYS.user,
      STORAGE_KEYS.config,
      STORAGE_KEYS.configHash,
      STORAGE_KEYS.dashboard,
      STORAGE_KEYS.activeLease
    ])
  ]);

  return {
    apiBaseUrl: local[STORAGE_KEYS.apiBaseUrl] ?? DEFAULT_API_BASE_URL,
    fingerprintId: local[STORAGE_KEYS.fingerprint] ?? null,
    accessToken: session[STORAGE_KEYS.token] ?? null,
    user: session[STORAGE_KEYS.user] ?? null,
    config: session[STORAGE_KEYS.config] ?? null,
    configHash: session[STORAGE_KEYS.configHash] ?? null,
    dashboard: session[STORAGE_KEYS.dashboard] ?? null,
    activeLease: session[STORAGE_KEYS.activeLease] ?? null
  };
}

async function setApiBaseUrl(apiBaseUrl) {
  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  await chrome.storage.local.set({ [STORAGE_KEYS.apiBaseUrl]: normalized });
  return getState();
}

async function login(email, password) {
  const apiBaseUrl = await getApiBaseUrl();
  const fingerprintId = await getOrCreateFingerprint();
  const response = await apiFetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    body: {
      email,
      password,
      fingerprint_id: fingerprintId
    }
  });

  await chrome.storage.session.set({
    [STORAGE_KEYS.token]: response.accessToken,
    [STORAGE_KEYS.user]: response.user
  });

  let config = null;
  try {
    config = await fetchClientConfig();
  } catch (error) {
    await chrome.storage.session.remove([
      STORAGE_KEYS.token,
      STORAGE_KEYS.user,
      STORAGE_KEYS.config,
      STORAGE_KEYS.configHash,
      STORAGE_KEYS.dashboard,
      STORAGE_KEYS.activeLease
    ]);
    error.message = `Logged in, but policy fetch failed: ${error.message}`;
    throw error;
  }

  await fetchDashboard();
  await notifyContentScripts();

  return {
    user: response.user,
    fingerprintId,
    config
  };
}

async function fetchClientConfig() {
  const apiBaseUrl = await getApiBaseUrl();
  const token = await getToken();
  const response = await apiFetch(`${apiBaseUrl}/client/config`, {
    method: "GET",
    token
  });

  await chrome.storage.session.set({
    [STORAGE_KEYS.config]: response.config,
    [STORAGE_KEYS.configHash]: response.configHash
  });

  await notifyContentScripts();

  return response;
}

async function fetchDashboard() {
  const apiBaseUrl = await getApiBaseUrl();
  const token = await getToken();
  const response = await apiFetch(`${apiBaseUrl}/client/dashboard`, {
    method: "GET",
    token
  });

  await chrome.storage.session.set({
    [STORAGE_KEYS.user]: response.user,
    [STORAGE_KEYS.config]: response.config,
    [STORAGE_KEYS.configHash]: response.configHash,
    [STORAGE_KEYS.dashboard]: response,
    [STORAGE_KEYS.activeLease]: response.activeLease
  });

  await notifyContentScripts();
  return response;
}

async function leaseAccount() {
  const apiBaseUrl = await getApiBaseUrl();
  const token = await getToken();
  const response = await apiFetch(`${apiBaseUrl}/session/lease-account`, {
    method: "GET",
    token
  });

  if (response.available === false) {
    return {
      unavailable: true,
      retryAfterMs: response.retryAfterMs ?? 1500,
      message: response.message ?? "Preparing session..."
    };
  }

  const activeLease = {
    leaseId: response.leaseId,
    provider: response.provider,
    remainingLimit: response.remainingLimit,
    expiresAt: response.expiresAt,
    vaultVersion: response.vaultVersion,
    vaultData: response.vaultData,
    // Proxy metadata stored with the lease so it can be cleared on wipe/release.
    proxy: response.proxy ?? null
  };

  if (response.vaultData) {
    try {
      await clearTargetSessionCookies();
      await injectCookies(response.vaultData);
      await verifyInjectedSession(response.vaultData);
    } catch (e) {
      console.warn("Failed to apply session material; releasing lease.");
      await clearTargetSessionCookies().catch(() => undefined);
      await clearProxySettings();
      await clearActiveLeaseState();
      await releaseUsage({ leaseId: response.leaseId, submitted: false }).catch(() => undefined);
      throw new Error("Preparing session, please retry.");
    }
  }

  // Apply proxy AFTER cookies are successfully injected so both are atomic from
  // the runner's perspective. If proxy setup fails we still have a usable session
  // (proxy is optional for routing; cookies are mandatory for authentication).
  if (response.proxy?.host) {
    await applyProxySettings(response.proxy).catch((err) => {
      console.warn("Proxy configuration failed (non-fatal):", err?.message);
    });
  }

  await chrome.storage.session.set({ [STORAGE_KEYS.activeLease]: activeLease });
  const dashboard = await fetchDashboard().catch(() => null);

  return {
    lease: response,
    dashboard,
    note: "Lease metadata received. Session material and proxy applied."
  };
}

async function injectCookies(vaultDataString) {
  let cookiesToSet = [];
  try {
    cookiesToSet = JSON.parse(vaultDataString);
  } catch (e) {
    throw new Error("vaultData is not valid JSON");
  }

  if (!Array.isArray(cookiesToSet)) {
    cookiesToSet = [cookiesToSet];
  }

  let appliedCount = 0;
  const failures = [];
  for (const cookie of cookiesToSet) {
    const details = toCookieSetDetails(cookie);
    if (!details) {
      continue;
    }

    try {
      await chrome.cookies.set(details);
      appliedCount += 1;
    } catch (error) {
      failures.push({
        name: details.name,
        url: details.url,
        message: error?.message ?? String(error)
      });
    }
  }

  if (failures.length > 0) {
    console.warn("Some session cookies could not be applied.", failures);
  }

  if (appliedCount === 0) {
    throw new Error("No session cookies could be applied.");
  }
}

async function verifyInjectedSession(vaultDataString) {
  const expectedSummary = summarizeVaultCookieGroups(parseVaultCookies(vaultDataString));
  if (!expectedSummary.hasAllNextAuthCookies) {
    throw new Error("Session material is incomplete.");
  }

  const currentCookies = await collectTargetCookies();
  const currentSummary = summarizeVaultCookieGroups(currentCookies);
  if (!currentSummary.hasAllNextAuthCookies) {
    throw new Error("Session material could not be verified.");
  }
}

function toCookieSetDetails(cookie) {
  if (!cookie || typeof cookie !== "object") {
    return null;
  }

  const { name, value, domain, path, secure, httpOnly, url, expirationDate, sameSite, hostOnly } = cookie;
  if (typeof name !== "string" || !name || typeof value !== "string") {
    return null;
  }

  const cleanPath = typeof path === "string" && path ? path : "/";
  const cleanDomain = typeof domain === "string" ? domain.trim() : "";
  const host = cleanDomain.replace(/^\./, "") || "labs.google.com";
  const details = {
    url: typeof url === "string" && url ? url : `https://${host}${cleanPath}`,
    name,
    value,
    path: cleanPath,
    secure: secure !== false,
    httpOnly: httpOnly !== false
  };

  if (Number.isFinite(expirationDate)) {
    details.expirationDate = expirationDate;
  }

  if (["no_restriction", "lax", "strict", "unspecified"].includes(sameSite)) {
    details.sameSite = sameSite;
  }

  if (cleanDomain && !hostOnly && !name.startsWith("__Host-")) {
    details.domain = cleanDomain;
  }

  return details;
}

async function wipeCookies(payload = {}) {
  let vaultDataString = payload?.vaultData;
  if (!vaultDataString) {
    const state = await getState();
    vaultDataString = state.activeLease?.vaultData;
  }
  if (!vaultDataString) return { ok: true };

  let cookiesToRemove = [];
  try {
    cookiesToRemove = JSON.parse(vaultDataString);
  } catch (e) {
    return { ok: false, error: "invalid vaultData" };
  }

  if (!Array.isArray(cookiesToRemove)) {
    cookiesToRemove = [cookiesToRemove];
  }

  for (const cookie of cookiesToRemove) {
    await removeCookie(cookie);
  }

  await clearTargetSessionCookies();

  // Always clear proxy settings alongside cookies so the profile returns to
  // its native network path immediately after the lease is released.
  await clearProxySettings();

  return { ok: true };
}

/**
 * Handles an unrequested signout detected by auto-signout-iso.js (Google itself
 * ended the session, e.g. a rejected/invalidated cookie redirected the tab to
 * /fx/api/auth/signout). Treated like a failed cookie injection: release the
 * lease as NOT submitted, then clear cookies/proxy.
 *
 * Order matters: clear cookies/proxy BEFORE telling the backend the lease is
 * done, since Google already invalidated the session server-side — there is
 * nothing left to preserve by waiting.
 */
async function handleAutoSignout() {
  const state = await getState();
  const leaseId = state.activeLease?.leaseId ?? state.dashboard?.activeLease?.leaseId;

  await clearTargetSessionCookies().catch(() => undefined);
  await clearActiveLeaseState();

  if (leaseId) {
    await releaseUsage({ leaseId, submitted: false }).catch(() => undefined);
  }

  await notifyContentScripts();
  return { handled: true };
}

async function clearTargetSessionCookies() {
  const cookies = await collectTargetCookies();
  await Promise.all(cookies.map((cookie) => removeCookie(cookie)));
}

async function collectTargetCookies() {
  const urlCookieGroups = await Promise.all(
    TARGET_COOKIE_URLS.map((url) => chrome.cookies.getAll({ url }))
  );

  return dedupeCookies(urlCookieGroups.flat());
}

async function removeCookie(cookie) {
  if (!cookie?.name) {
    return;
  }

  const details = {
    url: cookie.url || `https://${String(cookie.domain || "labs.google.com").replace(/^\./, "")}${cookie.path || "/"}`,
    name: cookie.name,
  };

  if (cookie.storeId) {
    details.storeId = cookie.storeId;
  }

  await chrome.cookies.remove(details);
}

function parseVaultCookies(vaultDataString) {
  let cookies = [];
  try {
    cookies = JSON.parse(vaultDataString);
  } catch {
    return [];
  }

  return Array.isArray(cookies) ? cookies : [cookies];
}

function summarizeVaultCookieGroups(cookies) {
  const validCookies = cookies.filter((cookie) => cookie?.name && typeof cookie.value === "string");
  const foundNames = new Set(validCookies.map((cookie) => cookie.name));
  const missingNextAuthCookies = NEXT_AUTH_COOKIE_NAMES.filter((name) => !foundNames.has(name));

  return {
    hasAllNextAuthCookies: missingNextAuthCookies.length === 0,
    missingNextAuthCookies,
  };
}

function dedupeCookies(cookies) {
  const seen = new Map();
  for (const cookie of cookies) {
    const partitionKey = cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : "";
    const key = [cookie.storeId || "", partitionKey, cookie.domain || "", cookie.path || "", cookie.name || ""].join("|");
    seen.set(key, cookie);
  }

  return [...seen.values()];
}

async function releaseUsage(payload = {}) {
  const apiBaseUrl = await getApiBaseUrl();
  const token = await getToken();
  const state = await getState();
  const leaseId = payload.leaseId ?? state.activeLease?.leaseId ?? state.dashboard?.activeLease?.leaseId;

  if (!leaseId) {
    throw new Error("No active lease is available for release.");
  }

  await apiFetch(`${apiBaseUrl}/session/release-usage`, {
    method: "POST",
    token,
    body: {
      leaseId,
      submitted: Boolean(payload.submitted)
    }
  });

  await clearLeaseMetadataOnly();
  await notifyContentScripts();

  return { released: true };
}

async function clearActiveLeaseState() {
  await clearLeaseMetadataOnly();
  // Proxy is only cleared for explicit cleanup paths (failed setup/logout/manual
  // reset), not for submitted live generations.
  await clearProxySettings();
}

async function clearLeaseMetadataOnly() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.dashboard);
  const dashboard = stored[STORAGE_KEYS.dashboard];

  if (dashboard && typeof dashboard === "object") {
    await chrome.storage.session.set({
      [STORAGE_KEYS.dashboard]: {
        ...dashboard,
        activeLease: null
      }
    });
  }

  await chrome.storage.session.remove([STORAGE_KEYS.activeLease]);
}

async function reportUsage(payload = {}) {
  const apiBaseUrl = await getApiBaseUrl();
  const token = await getToken();
  const state = await getState();
  const leaseId = payload.leaseId ?? state.activeLease?.leaseId ?? state.dashboard?.activeLease?.leaseId;

  if (!leaseId) {
    throw new Error("No active lease is available for usage reporting.");
  }

  const response = await apiFetch(`${apiBaseUrl}/session/report-usage`, {
    method: "POST",
    token,
    body: {
      leaseId,
      outcome: payload.outcome,
      usageUnits: payload.usageUnits,
      providerStatusCode: payload.providerStatusCode,
      providerErrorType: payload.providerErrorType,
      providerMessage: payload.providerMessage,
      retryAfterSeconds: payload.retryAfterSeconds
    }
  });

  await clearLeaseMetadataOnly();
  const dashboard = await fetchDashboard().catch(() => null);
  return { report: response, dashboard };
}

async function openCustomerLink(target) {
  const apiBaseUrl = await getApiBaseUrl();
  const siteBaseUrl = resolveSiteBaseUrl(apiBaseUrl);
  const path = target === "support" ? "/#support" : "/#pricing";
  const tab = await chrome.tabs.create({ url: `${siteBaseUrl}${path}` });
  return { url: tab.url ?? `${siteBaseUrl}${path}` };
}

async function openFlowPage() {
  const tab = await chrome.tabs.create({ url: "https://labs.google/fx/tools/flow" });
  return { url: tab.url ?? "https://labs.google/fx/tools/flow" };
}

async function logout() {
  const apiBaseUrl = await getApiBaseUrl();
  const stored = await chrome.storage.session.get(STORAGE_KEYS.token);
  const token = stored[STORAGE_KEYS.token];
  if (token) {
    await apiFetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      token,
      body: { revoke: true },
    }).catch(() => undefined);
  }

  await clearTargetSessionCookies().catch(() => undefined);
  await clearProxySettings().catch(() => undefined);
  await chrome.storage.session.remove([
    STORAGE_KEYS.token,
    STORAGE_KEYS.user,
    STORAGE_KEYS.config,
    STORAGE_KEYS.configHash,
    STORAGE_KEYS.dashboard,
    STORAGE_KEYS.activeLease
  ]);
  await notifyContentScripts();
  return getState();
}

async function getApiBaseUrl() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.apiBaseUrl);
  return stored[STORAGE_KEYS.apiBaseUrl] ?? DEFAULT_API_BASE_URL;
}

async function getToken() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.token);
  const token = stored[STORAGE_KEYS.token];
  if (!token) {
    throw new Error("Please log in first.");
  }
  return token;
}

async function setToken(token) {
  await chrome.storage.session.set({ [STORAGE_KEYS.token]: token });
}

async function getOrCreateFingerprint() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.fingerprint);
  if (stored[STORAGE_KEYS.fingerprint]) {
    return stored[STORAGE_KEYS.fingerprint];
  }

  const fingerprint = await buildFingerprint();
  await chrome.storage.local.set({ [STORAGE_KEYS.fingerprint]: fingerprint });
  return fingerprint;
}

async function buildFingerprint() {
  const stableRandomId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const source = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? "unknown",
    stableRandomId
  ].join("|");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const bytes = Array.from(new Uint8Array(digest));
  return `fp_${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const authenticatedFetch = createAuthenticatedFetch({
  fetchImpl: (...args) => fetch(...args),
  getToken,
  setToken,
  getApiBaseUrl,
});

async function apiFetch(url, options) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await authenticatedFetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    token: options.token,
    skipRefresh: options.skipRefresh,
  });

  let text = "";
  let data = null;

  try {
    text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Backend response was not valid JSON from ${url}`);
  }

  if (!response.ok) {
    const message = data?.error?.message ?? `Request failed with ${response.status}`;
    const error = new Error(message);
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * Sets WebRTC IP handling to the most restrictive policy, preventing the
 * browser from exposing the runner's local network interface addresses through
 * native media channels past the active proxy container.
 *
 * Called at module top-level (every SW wake-up) and again inside
 * applyProxySettings so the policy is always co-active with the proxy.
 */
async function enforceWebRtcPrivacy() {
  if (!chrome.privacy?.network?.webRTCIPHandlingPolicy) return;

  await new Promise((resolve, reject) => {
    chrome.privacy.network.webRTCIPHandlingPolicy.set(
      { value: "disable_non_proxied_udp", scope: "regular" },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Restores the WebRTC IP handling policy to the browser default.
 * Called during proxy teardown so the runner's profile is not permanently
 * locked after the lease ends.
 */
async function clearWebRtcPrivacy() {
  if (!chrome.privacy?.network?.webRTCIPHandlingPolicy) return;

  await new Promise((resolve) => {
    chrome.privacy.network.webRTCIPHandlingPolicy.clear(
      { scope: "regular" },
      resolve
    );
  });
}

/**
 * Applies a PAC-script-based upstream proxy scoped strictly to the target
 * platform domains. All other traffic continues DIRECT so the browser's
 * native TLS fingerprint is preserved for unrelated requests.
 *
 * If credentials are provided they are stored in session storage so the
 * top-level onAuthRequired listener can supply them on 407 challenges.
 *
 * @param {object} proxy - { host, port, username?, password? }
 */
async function applyProxySettings(proxy) {
  if (!proxy?.host) return;

  const proxyPort = proxy.port ?? 8080;

  // PAC script routes only target-platform hostnames through the gateway proxy.
  // This ensures all concurrent runners sharing the session egress from the
  // same static edge IP without affecting other browser traffic.
  const pacData = [
    "function FindProxyForURL(url, host) {",
    "  var targets = ['labs.google.com', 'labs.google'];",
    "  for (var i = 0; i < targets.length; i++) {",
    "    if (host === targets[i] || dnsDomainIs(host, '.' + targets[i])) {",
    `      return "PROXY ${proxy.host}:${proxyPort}";`,
    "    }",
    "  }",
    "  return 'DIRECT';",
    "}"
  ].join("\n");

  await new Promise((resolve, reject) => {
    chrome.proxy.settings.set(
      { value: { mode: "pac_script", pacScript: { data: pacData } }, scope: "regular" },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      }
    );
  });

  // Persist credentials for the onAuthRequired handler. Stored in session storage
  // so they are automatically purged when the browser process exits.
  if (proxy.username && proxy.password) {
    await chrome.storage.session.set({
      [STORAGE_KEYS.proxyCredentials]: {
        host: proxy.host,
        port: proxyPort,
        username: proxy.username,
        password: proxy.password
      }
    });
  }

  // Re-enforce WebRTC privacy in lock-step with the proxy. If the policy was
  // reset by another extension or a SW restart race, this restores it so the
  // proxy and the WebRTC policy are always co-active.
  await enforceWebRtcPrivacy().catch(() => undefined);
}

/**
 * Restores the profile's proxy to its default (direct) state, removes stored
 * credentials, and resets the WebRTC IP policy so the runner's profile is
 * clean between lease cycles.
 */
async function clearProxySettings() {
  await new Promise((resolve) => {
    chrome.proxy.settings.clear({ scope: "regular" }, resolve);
  });
  await chrome.storage.session.remove(STORAGE_KEYS.proxyCredentials).catch(() => undefined);
  // Reset WebRTC policy in sync with proxy teardown — proxy and privacy policy
  // must always be cleared together to avoid a state where the proxy is gone
  // but UDP is still blocked (which would break non-session browser activity).
  await clearWebRtcPrivacy().catch(() => undefined);
}

function normalizeApiBaseUrl(value) {
  const url = new URL(value);
  return url.origin;
}

function resolveSiteBaseUrl(apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return "http://localhost:3001";
  }

  return `${url.protocol}//${url.hostname.replace(/^api\./, "")}`;
}

function serializeError(error) {
  return {
    message: error?.message ?? "Unexpected error",
    code: error?.code,
    status: error?.status
  };
}

async function notifyContentScripts() {
  const tabs = await chrome.tabs.query({
    url: ["https://labs.google/*", "https://labs.google.com/*"]
  });

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) {
        return;
      }

      const message = { type: "SESSION_BRIDGE_STATE_UPDATED" };
      const sent = await chrome.tabs.sendMessage(tab.id, message).then(
        () => true,
        () => false
      );

      if (sent || !chrome.scripting?.executeScript) {
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/flow-gate.js"]
      }).catch(() => undefined);
      await chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
    })
  );
}
