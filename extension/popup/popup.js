const elements = {
  settingsForm: document.querySelector("#settingsForm"),
  loginForm: document.querySelector("#loginForm"),
  portalPanel: document.querySelector("#portalPanel"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  sessionChip: document.querySelector("#sessionChip"),
  emailInput: document.querySelector("#email"),
  passwordInput: document.querySelector("#password"),
  emailLabel: document.querySelector("#emailLabel"),
  planLabel: document.querySelector("#planLabel"),
  roleBadge: document.querySelector("#roleBadge"),
  creditLabel: document.querySelector("#creditLabel"),
  creditBar: document.querySelector("#creditBar"),
  creditsUsedLabel: document.querySelector("#creditsUsedLabel"),
  creditsLimitLabel: document.querySelector("#creditsLimitLabel"),
  daysLabel: document.querySelector("#daysLabel"),
  leaseStateLabel: document.querySelector("#leaseStateLabel"),
  providerLabel: document.querySelector("#providerLabel"),
  leaseExpiryLabel: document.querySelector("#leaseExpiryLabel"),
  leaseButton: document.querySelector("#leaseButton"),
  refreshDashboardButton: document.querySelector("#refreshDashboardButton"),
  upgradeButton: document.querySelector("#upgradeButton"),
  supportButton: document.querySelector("#supportButton"),
  flowBridgeStateLabel: document.querySelector("#flowBridgeStateLabel"),
  flowPlanLabel: document.querySelector("#flowPlanLabel"),
  flowLockLabel: document.querySelector("#flowLockLabel"),
  flowPolicyLabel: document.querySelector("#flowPolicyLabel"),
  flowLeaseLabel: document.querySelector("#flowLeaseLabel"),
  flowCostLabel: document.querySelector("#flowCostLabel"),
  flowCreditLabel: document.querySelector("#flowCreditLabel"),
  openFlowButton: document.querySelector("#openFlowButton"),
  syncFlowButton: document.querySelector("#syncFlowButton"),
  historyCountLabel: document.querySelector("#historyCountLabel"),
  historyList: document.querySelector("#historyList"),
  reportSuccessButton: document.querySelector("#reportSuccessButton"),
  reportIssueButton: document.querySelector("#reportIssueButton"),
  diagnosticList: document.querySelector("#diagnosticList"),
  configHashLabel: document.querySelector("#configHashLabel"),
  logoutButton: document.querySelector("#logoutButton"),
  statusLine: document.querySelector("#statusLine")
};

let currentState = null;
let currentDashboard = null;

const PLAN_DISPLAY_NAMES = {
  BASIC: "PRO",
  PRO: "ULTRA",
  ULTRA: "UNLIMITED"
};
const LOGIN_DRAFT_KEY = "vidgenLoginDraft";

void boot().catch((error) => {
  document.body.classList.remove("is-booting");
  showStatus(error.message ?? "Extension popup failed to start.", "error");
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

for (const input of [elements.emailInput, elements.passwordInput]) {
  input.addEventListener("input", () => {
    void saveLoginDraft();
  });
}

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await run("Backend URL saved.", () =>
    sendMessage({
      type: "SET_API_BASE_URL",
      apiBaseUrl: elements.apiBaseUrl.value
    })
  );
  if (result) {
    await boot();
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(elements.loginForm);
  const email = String(form.get("email"));
  const password = String(form.get("password"));

  const result = await run("Logged in. Dashboard synced.", () =>
    sendMessage({
      type: "LOGIN",
      email,
      password
    })
  );

  if (!result) {
    return;
  }

  await clearLoginDraft();
  elements.loginForm.reset();
  await boot();
  await prepareLease("Session prepared.");
});

elements.refreshDashboardButton.addEventListener("click", async () => {
  await refreshDashboard("Dashboard refreshed.");
});

elements.leaseButton.addEventListener("click", async () => {
  await prepareLease("Lease active.");
});

async function prepareLease(successMessage) {
  const response = await run(successMessage, () => sendMessage({ type: "LEASE_ACCOUNT" }));
  if (response) {
    if (response.unavailable) {
      showStatus(response.message ?? "Preparing session...", "neutral");
      return;
    }
    currentDashboard = response.dashboard ?? currentDashboard;
    await refreshDashboard("Lease and dashboard synced.");
  }
}

elements.upgradeButton.addEventListener("click", async () => {
  await run("Upgrade page opened.", () => sendMessage({ type: "OPEN_CUSTOMER_LINK", target: "upgrade" }));
});

elements.supportButton.addEventListener("click", async () => {
  await run("Support page opened.", () => sendMessage({ type: "OPEN_CUSTOMER_LINK", target: "support" }));
});

elements.openFlowButton.addEventListener("click", async () => {
  await run("Google Flow opened.", () => sendMessage({ type: "OPEN_FLOW_PAGE" }));
});

elements.syncFlowButton.addEventListener("click", async () => {
  await refreshDashboard("Flow Bridge synced.");
});

elements.reportSuccessButton.addEventListener("click", async () => {
  await reportUsage("SUCCESS", "Success report saved.");
});

elements.reportIssueButton.addEventListener("click", async () => {
  await reportUsage("TRANSIENT_ERROR", "Issue report saved.");
});

elements.logoutButton.addEventListener("click", async () => {
  const result = await run("Logged out.", () => sendMessage({ type: "LOGOUT" }));
  if (result) {
    currentDashboard = null;
    await boot();
  }
});

async function boot() {
  await restoreLoginDraft();
  currentState = await sendMessage({ type: "GET_STATE" });
  elements.apiBaseUrl.value = currentState.apiBaseUrl;

  if (currentState.accessToken) {
    currentDashboard = currentState.dashboard;
    await refreshDashboard("Ready.", { quietFailure: true });
  }

  render();
}

async function saveLoginDraft() {
  const draft = {
    email: elements.emailInput.value,
    password: elements.passwordInput.value
  };

  if (globalThis.chrome?.storage?.session) {
    await chrome.storage.session.set({ [LOGIN_DRAFT_KEY]: draft });
    return;
  }

  localStorage.setItem(LOGIN_DRAFT_KEY, JSON.stringify(draft));
}

async function restoreLoginDraft() {
  let draft = null;

  if (globalThis.chrome?.storage?.session) {
    const stored = await chrome.storage.session.get(LOGIN_DRAFT_KEY);
    draft = stored[LOGIN_DRAFT_KEY] ?? null;
  } else {
    try {
      draft = JSON.parse(localStorage.getItem(LOGIN_DRAFT_KEY) ?? "null");
    } catch {
      draft = null;
    }
  }

  if (!draft) {
    return;
  }

  if (!elements.emailInput.value) {
    elements.emailInput.value = draft.email ?? "";
  }

  if (!elements.passwordInput.value) {
    elements.passwordInput.value = draft.password ?? "";
  }
}

async function clearLoginDraft() {
  if (globalThis.chrome?.storage?.session) {
    await chrome.storage.session.remove(LOGIN_DRAFT_KEY);
    return;
  }

  localStorage.removeItem(LOGIN_DRAFT_KEY);
}

async function refreshDashboard(message = "Dashboard refreshed.", options = {}) {
  const dashboard = await run(message, () => sendMessage({ type: "GET_DASHBOARD" }), options);
  if (dashboard) {
    currentDashboard = dashboard;
    currentState = await sendMessage({ type: "GET_STATE" });
    render();
  }
}

async function reportUsage(outcome, successMessage) {
  const result = await run(successMessage, () =>
    sendMessage({
      type: "REPORT_USAGE",
      payload: {
        outcome,
        usageUnits: currentDashboard?.config?.creditPolicy?.generationLoopCredits ?? 1
      }
    })
  );

  if (result) {
    currentDashboard = result.dashboard ?? currentDashboard;
    await refreshDashboard("Activity updated.", { quietFailure: true });
  }
}

function render() {
  const loggedIn = Boolean(currentState?.accessToken && currentState?.user);
  elements.loginForm.classList.toggle("hidden", loggedIn);
  elements.portalPanel.classList.toggle("hidden", !loggedIn);
  document.body.classList.remove("is-booting");

  if (!loggedIn) {
    renderSessionChip();
    showStatus("Log in with a backend-generated virtual email.");
    return;
  }

  const dashboard = currentDashboard ?? currentState.dashboard ?? {};
  const user = dashboard.user ?? currentState.user;
  const credits = dashboard.credits ?? {
    used: user.creditsUsed,
    limit: user.creditsLimit,
    remaining: Math.max(0, user.creditsLimit - user.creditsUsed)
  };

  elements.emailLabel.textContent = user.email;
  elements.roleBadge.textContent = user.role;
  elements.planLabel.textContent = `${displayPlan(user.plan)} plan, ${user.daysRemaining ?? "?"} days left`;
  elements.creditLabel.textContent = `${credits.remaining} left`;
  elements.creditsUsedLabel.textContent = String(credits.used);
  elements.creditsLimitLabel.textContent = String(credits.limit);
  elements.daysLabel.textContent = String(user.daysRemaining ?? 0);
  elements.creditBar.style.width = `${percentage(credits.used, credits.limit)}%`;

  renderLease(dashboard.activeLease ?? currentState.activeLease);
  renderFlowBridge(dashboard, currentState);
  renderHistory(dashboard.history ?? []);
  renderDiagnostics(dashboard, currentState);
  renderSessionChip();
  showStatus("Ready.");
}

function renderLease(lease) {
  const active = Boolean(lease);
  elements.leaseStateLabel.textContent = active ? "Active" : "Inactive";
  elements.providerLabel.textContent = lease?.provider ?? "None";
  elements.leaseExpiryLabel.textContent = lease?.expiresAt ? formatDate(lease.expiresAt) : "Not leased";
}

function renderFlowBridge(dashboard, state) {
  const user = dashboard.user ?? state.user;
  const config = dashboard.config ?? state.config;
  const credits = dashboard.credits ?? {
    remaining: Math.max(0, (user?.creditsLimit ?? 0) - (user?.creditsUsed ?? 0))
  };
  const lease = dashboard.activeLease ?? state.activeLease;
  const blocked = config?.creditPolicy?.blockedHighCreditParameters ?? [];
  const cost = config?.creditPolicy?.generationLoopCredits ?? 20;
  const connected = Boolean(user && config);
  const lockActive = blocked.length > 0;

  elements.flowBridgeStateLabel.textContent = connected ? "Connected" : "Not connected";
  elements.flowPlanLabel.textContent = connected ? `${displayPlan(user.plan)} plan` : "Not connected";
  elements.flowLockLabel.textContent = lockActive
    ? "Quality / Pro locked for this plan"
    : connected
      ? "Premium controls unlocked"
      : "Log in to sync policy";
  elements.flowPolicyLabel.textContent = config ? "Loaded" : "Not loaded";
  elements.flowPolicyLabel.className = config ? "pass" : "fail";
  elements.flowLeaseLabel.textContent = lease ? "Active" : "Inactive";
  elements.flowLeaseLabel.className = lease ? "pass" : "fail";
  elements.flowCostLabel.textContent = String(cost);
  elements.flowCreditLabel.textContent = `${credits.remaining ?? 0} left`;
}

function renderHistory(history) {
  elements.historyCountLabel.textContent = `${history.length} item${history.length === 1 ? "" : "s"}`;

  if (!history.length) {
    elements.historyList.innerHTML = `<p class="empty">No generation reports yet.</p>`;
    return;
  }

  elements.historyList.innerHTML = history
    .map(
      (item) => `
        <article class="history-item">
          <div>
            <strong>${escapeHtml(item.outcome)}</strong>
            <span>${escapeHtml(item.provider)} · ${formatDate(item.createdAt)}</span>
          </div>
          <b>${item.usageUnits}</b>
        </article>
      `
    )
    .join("");
}

function renderDiagnostics(dashboard, state) {
  const diagnostics = dashboard.diagnostics ?? {
    backendReachable: Boolean(dashboard.user),
    authenticated: Boolean(state.accessToken),
    policyLoaded: Boolean(state.config),
    policyHashMatchesToken: Boolean(state.configHash),
    leaseActive: Boolean(state.activeLease)
  };
  const blocked = dashboard.config?.creditPolicy?.blockedHighCreditParameters ?? state.config?.creditPolicy?.blockedHighCreditParameters ?? [];
  const rows = [
    ["Backend", diagnostics.backendReachable],
    ["Logged in", diagnostics.authenticated],
    ["Policy loaded", diagnostics.policyLoaded],
    ["Policy hash", diagnostics.policyHashMatchesToken],
    ["Lease active", diagnostics.leaseActive],
    ["PRO premium lock", blocked.length > 0]
  ];

  elements.configHashLabel.textContent = state.configHash ? `Policy ${state.configHash.slice(0, 10)}` : "No policy";
  elements.diagnosticList.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="diagnostic-row">
          <span>${label}</span>
          <b class="${value ? "pass" : "fail"}">${value ? "Pass" : "Check"}</b>
        </div>
      `
    )
    .join("");
}

async function run(successMessage, task, options = {}) {
  setBusy(true);
  showStatus("Working...");
  try {
    const result = await task();
    showStatus(successMessage);
    return result;
  } catch (error) {
    if (!options.quietFailure) {
      showStatus(error.message ?? "Request failed.", "error");
    }
    return null;
  } finally {
    setBusy(false);
  }
}

function activateTab(name) {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }

  for (const panel of document.querySelectorAll(".tab-panel")) {
    panel.classList.toggle("hidden", panel.dataset.panel !== name);
  }
}

function setBusy(isBusy) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

function renderSessionChip() {
  elements.sessionChip.textContent = "Online";
  elements.sessionChip.className = "chip ok";
}

function displayPlan(plan) {
  return PLAN_DISPLAY_NAMES[plan] ?? plan ?? "PRO";
}

function showStatus(message, tone = "neutral") {
  elements.statusLine.textContent = message;
  elements.statusLine.dataset.tone = tone;
}

async function sendMessage(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    throw new Error("Open this popup from the installed Chrome extension.");
  }

  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error?.message ?? "Extension request failed.");
  }
  return response.result;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function percentage(used, limit) {
  if (!limit) {
    return 0;
  }

  return Math.max(0, Math.min(100, (used / limit) * 100));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
