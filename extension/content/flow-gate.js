(async function applySessionBridgeFeatureGate() {
  if (globalThis.__vidgenFlowGateLoaded) {
    return;
  }
  globalThis.__vidgenFlowGateLoaded = true;

  const LOCK_ATTR = "data-session-bridge-locked";
  const BADGE_ATTR = "data-session-bridge-badge";
  const PREMIUM_MASK_ATTR = "data-session-bridge-premium-mask";
  const MODEL_LOCK_OVERLAY_ATTR = "data-session-bridge-model-lock-overlay";
  const MODEL_LOCK_FIXED_OVERLAY_ATTR = "data-session-bridge-model-lock-fixed-overlay";
  const MODEL_LOCK_DECOR_ATTR = "data-session-bridge-model-lock-decor";
  const PREMIUM_AVATAR_ATTR = "data-session-bridge-premium-avatar";
  const PREMIUM_BADGE_ATTR = "data-session-bridge-premium-badge";
  const ORIGINAL_AVATAR_ATTR = "data-session-bridge-original-avatar-src";
  const ORIGINAL_POSITION_ATTR = "data-session-bridge-original-position";
  const ORIGINAL_TEXT_ATTR = "data-session-bridge-original-text";
  const UI_HOST_ID = "vidgen-flow-ui-host";
  const TOAST_ID = "session-bridge-toast";
  const LEGACY_PANEL_ID = "session-bridge-panel";
  const SESSION_BADGE_ID = "session-bridge-status-badge";
  const BANNER_ID = "session-bridge-mismatch-banner";
  const BANNER_RETRY_BUTTON_ID = "__flow_retry_session__";
  const BANNER_DISMISS_BUTTON_ID = "__flow_retry_dismiss__";
  const LOCKED_CLASS = "session-bridge-locked";
  // No replay delay constant — programmatic click replay is fully removed.
  // Session cookies are injected on page load; the runner's manual click is native.
  const PREMIUM_MASK_REFRESH_MS = 750;
  const DEFAULT_LEASE_READY_WINDOW_MS = 5_000;
  const ACTIVITY_LEASE_READY_WINDOW_MS = 30_000;
  const ACTIVITY_LEASE_DEBOUNCE_MS = 1_000;
  const AUTO_LEASE_RETRY_MIN_MS = 750;
  const AUTO_LEASE_RETRY_MAX_MS = 5_000;
  const AUTO_LEASE_RETRY_JITTER_MS = 350;
  const PREMIUM_AVATAR_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23f8d46a'/%3E%3Cstop offset='1' stop-color='%236b4b00'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='128' height='128' rx='64' fill='url(%23g)'/%3E%3Ccircle cx='64' cy='50' r='22' fill='%23fff7d6'/%3E%3Cpath d='M28 108c7-24 25-36 36-36s29 12 36 36' fill='%23fff7d6'/%3E%3Cpath d='M42 30l12 10 10-16 10 16 12-10-6 30H48z' fill='%23211100' opacity='.9'/%3E%3C/svg%3E";
  const PLAN_DISPLAY_NAMES = {
    BASIC: "PRO",
    PRO: "ULTRA",
    ULTRA: "UNLIMITED"
  };
  const LOCKED_MODEL_TEXT_PATTERN = /\b(omni\s+flash|veo\s*3(?:\.1)?\s*(?:[-\u2013\u2014]\s*)?(lite|fast|quality|lower\s+priority))\b/i;
  const LOWER_PRIORITY_PATTERN = /lower\s+priority/i;
  const LOWER_PRIORITY_MODEL_PATTERN = /\bveo\b/i;
  const LOWER_PRIORITY_TIER_PATTERN = /\blite\b/i;

  function isLockedModelText(text) {
    return LOCKED_MODEL_TEXT_PATTERN.test(text) && !isLowerPriorityExemption(text);
  }

  function isLowerPriorityExemption(text) {
    const normalized = normalizeModelAccessText(text);
    return (
      LOWER_PRIORITY_MODEL_PATTERN.test(normalized) &&
      LOWER_PRIORITY_TIER_PATTERN.test(normalized) &&
      LOWER_PRIORITY_PATTERN.test(normalized)
    );
  }

  function normalizeModelAccessText(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  const generationSignals = {
    pendingAt: 0,
    reported: false,
    released: false,
    releaseInProgress: false,
    reporting: false,
    retryAfter: 0
  };
  const CONTROL_SELECTOR = [
    "button",
    "[role='button']",
    "[role='menuitem']",
    "[role='option']",
    "[role='radio']",
    "[role='switch']",
    "[aria-label]",
    "[data-credit-cost]",
    "[data-parameter-units]"
  ].join(",");
  const PROFILE_SELECTOR = [
    "a[href*='SignOutOptions']",
    "a[href*='accounts.google.com']",
    "button[aria-label*='Google Account' i]",
    "button[aria-label*='account' i]",
    "[role='button'][aria-label*='account' i]",
    "[aria-label*='profile' i]",
    "[aria-label*='avatar' i]"
  ].join(",");
  const AVATAR_SELECTOR = [
    "img[alt*='profile' i]",
    "img[alt*='account' i]",
    "img[src*='googleusercontent.com']",
    "img[src*='lh3.googleusercontent.com']"
  ].join(",");

  let state = await readState();
  let scheduled = false;
  // Tracks in-flight auto-lease request so concurrent triggers are deduplicated.
  let autoLeasePromise = null;
  let autoLeaseRetryTimer = null;
  let lastActivityLeaseAttemptAt = 0;
  // Backstop for the Generate gate, independent of the visual-lock DOM heuristics
  // (panel/row size detection). Records the last model-row text the runner actually
  // clicked, regardless of whether that row was successfully recognized/greyed-out
  // by the heuristics above. handleGenerateClick blocks on this directly, so even if
  // a new Google UI layout slips past lockVisibleModelOptions(), generation still
  // can't proceed on a locked model — only the "[Lower Priority]" exemption passes.
  let lastSelectedModelLocked = false;
  let requestedLeaseReadyWindowMs = DEFAULT_LEASE_READY_WINDOW_MS;
  let authCallbackReportInFlight = false;
  let lastAuthCallbackLeaseId = null;
  let uiHost = null;
  let uiRoot = null;

  removeLegacyPanel();
  injectStyle();
  document.documentElement.dataset.sessionBridgeConfigHash = state.configHash ?? "";
  document.documentElement.dataset.sessionBridgePlan = state.config?.plan ?? state.user?.plan ?? "";

  applyGate();
  applyPremiumMask();

  // Trigger lease acquisition immediately on page load.
  // Cookies will be injected into this clean profile before the runner clicks anything,
  // guaranteeing that the subsequent manual submit carries a native isTrusted: true event.
  void triggerAutoLease();

  window.setInterval(removeLegacyPanel, 500);
  window.setInterval(() => {
    if (state.user && state.config) {
      applyPremiumMask();
    }
  }, PREMIUM_MASK_REFRESH_MS);

  const observer = new MutationObserver(scheduleApplyGate);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-credit-cost", "data-parameter-units", "class", "id", "src", "alt", "title", "style"]
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "SESSION_BRIDGE_STATE_UPDATED") {
      return;
    }

    void refreshStateAndAutoLease();
  });

  for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "touchstart", "keydown"]) {
    window.addEventListener(eventName, handleGuardedInteraction, true);
    document.addEventListener(eventName, handleGuardedInteraction, true);
  }

  for (const eventName of ["focusin", "input", "paste"]) {
    document.addEventListener(eventName, handleSessionPrepActivity, true);
  }

  async function readState() {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    if (!response?.ok) {
      return {};
    }

    return response.result ?? {};
  }

  async function refreshState() {
    state = await readState();
    document.documentElement.dataset.sessionBridgeConfigHash = state.configHash ?? "";
    document.documentElement.dataset.sessionBridgePlan = state.config?.plan ?? state.user?.plan ?? "";
    removeLegacyPanel();
    updateSessionBadge();
    scheduleApplyGate();
  }

  async function refreshStateAndAutoLease() {
    await refreshState();
    await triggerAutoLease();
  }

  function scheduleApplyGate() {
    removeLegacyPanel();
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      removeLegacyPanel();
      applyGate();
      applyPremiumMask();
      void detectAuthCallbackIssue();
      void detectGenerationStart();
      detectGenerationOutcome();
    }, 150);
  }

  function applyGate() {
    const config = state.config;
    if (!config?.creditPolicy) {
      clearLocks();
      lockVisibleModelOptions(shouldLockModelOptions());
      return;
    }

    const shouldLockPremium = shouldLockModelOptions();
    const blockedParameters = new Set(
      (config.creditPolicy.blockedHighCreditParameters ?? []).map((value) => String(value).toLowerCase())
    );

    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      const shouldLock = shouldLockPremium && isPremiumControl(element, blockedParameters);
      if (shouldLock) {
        lockControl(element);
      } else if (element.hasAttribute(LOCK_ATTR)) {
        unlockControl(element);
      }
    }

    lockVisibleModelOptions(shouldLockPremium);
  }

  function handleGuardedInteraction(event) {
    removeLegacyPanel();
    if (!state.user || !state.config) {
      return;
    }

    const eventElement = event.target instanceof Element ? event.target : null;
    if (eventElement && isPromptEntryInteraction(event, eventElement)) {
      prepareLeaseForUserActivity();
    }

    if (event.type === "click" && eventElement) {
      trackModelSelectionClick(eventElement);
    }

    if (eventElement && isPremiumMaskInteraction(eventElement)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToastThrottled("Account controls are locked while using Vidgen Flow.");
      return;
    }

    const lockedElement = eventElement?.closest(`[${LOCK_ATTR}='true']`);
    if (lockedElement) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToastThrottled("Quality is locked on the Pro plan.");
      return;
    }

    const lockedModelOption = eventElement ? findLockedModelOptionRow(eventElement, event) : null;
    if (lockedModelOption) {
      lockModelOptionRow(lockedModelOption);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToastThrottled("This model is locked on the Pro plan.");
      return;
    }

    const target = eventElement?.closest(CONTROL_SELECTOR) ?? null;
    if (!target) {
      return;
    }

    if (shouldBlockControlNow(target)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToastThrottled("Quality is locked on the Pro plan.");
      return;
    }

    if (event.type === "click" && isGenerateControl(target)) {
      void handleGenerateClick(event, target);
    }
  }

  function handleSessionPrepActivity(event) {
    if (!state.user || !state.config) {
      return;
    }

    const eventElement = event.target instanceof Element ? event.target : null;
    if (eventElement && isPromptEntryInteraction(event, eventElement)) {
      prepareLeaseForUserActivity();
    }
  }

  function prepareLeaseForUserActivity() {
    if (!shouldPrepareLease(ACTIVITY_LEASE_READY_WINDOW_MS)) {
      return;
    }

    const now = Date.now();
    if (now - lastActivityLeaseAttemptAt < ACTIVITY_LEASE_DEBOUNCE_MS) {
      return;
    }

    lastActivityLeaseAttemptAt = now;
    requestedLeaseReadyWindowMs = Math.max(requestedLeaseReadyWindowMs, ACTIVITY_LEASE_READY_WINDOW_MS);
    void triggerAutoLease();
  }

  function isPromptEntryInteraction(event, element) {
    if (!["focusin", "input", "paste", "keydown", "pointerdown", "mousedown", "touchstart", "click"].includes(event.type)) {
      return false;
    }

    const field = element.closest("textarea, input, [contenteditable='true'], [role='textbox']");
    if (!(field instanceof HTMLElement)) {
      return false;
    }

    if (field.matches("input")) {
      const type = String(field.getAttribute("type") ?? "text").toLowerCase();
      if (!["text", "search", "url", "email", ""].includes(type)) {
        return false;
      }
    }

    const context = [
      field.getAttribute("placeholder"),
      field.getAttribute("aria-label"),
      field.getAttribute("title"),
      field.getAttribute("data-placeholder"),
      field.closest("[aria-label]")?.getAttribute("aria-label"),
      field.closest("form")?.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 600);

    if (!context) {
      return true;
    }

    return /\b(prompt|describe|create|generate|video|idea|message|ask|what do you want)\b/i.test(context);
  }

  function isPremiumMaskInteraction(element) {
    return Boolean(
      element.closest(`[${PREMIUM_MASK_ATTR}='true']`) ||
        element.closest(`[${PREMIUM_AVATAR_ATTR}='true']`) ||
        element.closest(`[${PREMIUM_BADGE_ATTR}='true']`)
    );
  }

  function shouldBlockControlNow(element) {
    const config = state.config;
    if (!shouldLockModelOptions() || !config?.creditPolicy) {
      return false;
    }

    const blockedParameters = new Set(
      (config.creditPolicy.blockedHighCreditParameters ?? []).map((value) => String(value).toLowerCase())
    );
    return isPremiumControl(element, blockedParameters);
  }

  function clearLocks() {
    clearModelOptionDecorations();

    for (const element of document.querySelectorAll(`[${LOCK_ATTR}='true']`)) {
      unlockControl(element);
    }
  }

  function lockVisibleModelOptions(shouldLockPremium) {
    clearModelOptionDecorations();

    if (!shouldLockPremium || !document.body) {
      return;
    }

    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      const row = findLockedModelOptionRow(element);
      if (row) {
        lockModelOptionRow(row);
      }
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const lockedRows = new Set();
    let node = walker.nextNode();

    while (node) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (isLockedModelText(text)) {
        const panel = findModelOptionsPanel(node.parentElement);
        if (!panel) {
          node = walker.nextNode();
          continue;
        }

        const row = findVisibleModelRow(node.parentElement);
        if (row && !lockedRows.has(row)) {
          lockedRows.add(row);
          lockModelOptionRow(row);
        }

        decorateLockedModelLabel(node.parentElement, row, panel);
      }
      node = walker.nextNode();
    }
  }

  function findVisibleModelRow(startElement) {
    if (!(startElement instanceof HTMLElement)) {
      return null;
    }

    let best = null;
    let current = startElement;

    for (let depth = 0; depth < 8 && current; depth += 1) {
      if (!isLockedModelRowCandidate(current)) {
        current = current.parentElement;
        continue;
      }

      best = current;

      current = current.parentElement;
    }

    return best;
  }

  function findLockedModelOptionRow(startElement, event) {
    if (!shouldLockModelOptions()) {
      return null;
    }

    if (!findModelOptionsPanel(startElement)) {
      return null;
    }

    const directRow = findVisibleModelRow(startElement);
    if (directRow) {
      return directRow;
    }

    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      for (const element of document.elementsFromPoint(clientX, clientY)) {
        const row = findVisibleModelRow(element);
        if (row) {
          return row;
        }
      }
    }

    return null;
  }

  function shouldLockModelOptions() {
    const plan = state.config?.plan ?? state.user?.plan;
    return Boolean(state.user && ["BASIC", "PRO", "ULTRA"].includes(plan));
  }

  function countLockedModelLabels(text) {
    if (isLowerPriorityExemption(text)) {
      return 0;
    }

    let count = 0;
    if (/\bomni\s+flash\b/i.test(text)) {
      count += 1;
    }
    if (/\bveo\s*3(?:\.1)?\s*[-\u2013\u2014]?\s*lite\b/i.test(text)) {
      count += 1;
    }
    if (/\bveo\s*3(?:\.1)?\s*[-\u2013\u2014]?\s*fast\b/i.test(text)) {
      count += 1;
    }
    if (/\bveo\s*3(?:\.1)?\s*[-\u2013\u2014]?\s*quality\b/i.test(text)) {
      count += 1;
    }
    return count;
  }

  function isLockedModelRowCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!isLockedModelText(text) || countLockedModelLabels(text) !== 1 || text.length > 140) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width >= 60 && rect.width <= 760 && rect.height >= 16 && rect.height <= 140;
  }

  function lockModelOptionRow(row) {
    if (!(row instanceof HTMLElement)) {
      return;
    }

    lockControl(row);
    row.setAttribute(MODEL_LOCK_DECOR_ATTR, "true");
    ensurePositioned(row);

    for (const child of row.querySelectorAll("button, [role='button'], [role='option'], [role='menuitem'], svg")) {
      if (child instanceof HTMLElement || child instanceof SVGElement) {
        child.setAttribute("aria-disabled", "true");
        child.setAttribute(LOCK_ATTR, "true");
        child.classList.add(LOCKED_CLASS);
      }
    }

    if (!row.querySelector(`[${MODEL_LOCK_OVERLAY_ATTR}='true']`)) {
      const overlay = document.createElement("span");
      overlay.setAttribute(MODEL_LOCK_OVERLAY_ATTR, "true");
      overlay.setAttribute("aria-hidden", "true");
      row.appendChild(overlay);
    }
  }

  function decorateLockedModelLabel(startElement, row, panel) {
    const labelElement = findModelLabelElement(startElement);
    if (!labelElement) {
      return;
    }

    labelElement.setAttribute(MODEL_LOCK_DECOR_ATTR, "true");
    labelElement.classList.add(LOCKED_CLASS);
    ensureFixedModelOverlay(labelElement, row, panel);
  }

  function findModelLabelElement(startElement) {
    if (!(startElement instanceof HTMLElement)) {
      return null;
    }

    let current = startElement;
    for (let depth = 0; depth < 4 && current; depth += 1) {
      const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (isLockedModelText(text) && countLockedModelLabels(text) === 1 && text.length <= 80) {
        return current;
      }
      current = current.parentElement;
    }

    return startElement;
  }

  function findModelOptionsPanel(startElement) {
    if (!(startElement instanceof HTMLElement)) {
      return null;
    }

    let current = startElement;
    for (let depth = 0; depth < 10 && current && current !== document.body; depth += 1) {
      const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const labelCount = countLockedModelLabels(text);
      const rect = current.getBoundingClientRect();
      if (labelCount >= 2 && rect.width >= 140 && rect.width <= 900 && rect.height >= 80 && rect.height <= 760) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function ensureFixedModelOverlay(labelElement, row, panel) {
    const labelRect = labelElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();

    if (labelRect.width <= 0 || labelRect.height <= 0 || panelRect.width <= 0 || panelRect.height <= 0) {
      return;
    }

    const top = rowRect && rowRect.height > 0 ? rowRect.top : Math.max(panelRect.top, labelRect.top - 18);
    const height = rowRect && rowRect.height > 0 ? rowRect.height : Math.max(44, labelRect.height + 28);
    const overlay = document.createElement("span");
    overlay.setAttribute(MODEL_LOCK_FIXED_OVERLAY_ATTR, "true");
    overlay.setAttribute(LOCK_ATTR, "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.add(LOCKED_CLASS);
    overlay.style.left = `${Math.max(0, panelRect.left)}px`;
    overlay.style.top = `${Math.max(0, top)}px`;
    overlay.style.width = `${Math.min(window.innerWidth - Math.max(0, panelRect.left), panelRect.width)}px`;
    overlay.style.height = `${Math.max(28, height)}px`;
    (document.body || document.documentElement).appendChild(overlay);
  }

  function clearModelOptionDecorations() {
    for (const overlay of document.querySelectorAll(`[${MODEL_LOCK_FIXED_OVERLAY_ATTR}='true']`)) {
      overlay.remove();
    }

    for (const element of document.querySelectorAll(`[${MODEL_LOCK_DECOR_ATTR}='true']`)) {
      element.removeAttribute(MODEL_LOCK_DECOR_ATTR);
      if (element.hasAttribute(LOCK_ATTR)) {
        unlockControl(element);
      } else {
        element.classList.remove(LOCKED_CLASS);
      }
    }
  }

  function isPremiumControl(element, blockedParameters) {
    const text = getControlText(element);
    const cost = String(element.getAttribute("data-credit-cost") ?? element.getAttribute("data-parameter-units") ?? "")
      .trim()
      .toLowerCase();

    if (cost && blockedParameters.has(cost)) {
      return true;
    }

    if (/\bnano\s+banana\s+pro\b/i.test(text)) {
      return false;
    }

    if (isLockedModelText(text)) {
      return true;
    }

    if (/\bfast\b/i.test(text) && !/\bquality\b/i.test(text)) {
      return false;
    }

    if (/\b(quality|high quality|pro|premium|ultra)\b/i.test(text)) {
      return true;
    }

    if (/\b(100|one hundred)\s*(credits?|units?)\b/i.test(text)) {
      return true;
    }

    return false;
  }

  function applyPremiumMask() {
    if (!state.user || !state.config) {
      clearPremiumMask();
      return;
    }

    const plan = PLAN_DISPLAY_NAMES[state.config.plan] || state.config.plan || "PRO";
    const containers = new Set();
    for (const element of document.querySelectorAll(PROFILE_SELECTOR)) {
      containers.add(element);
    }

    for (const avatar of document.querySelectorAll(AVATAR_SELECTOR)) {
      const container = avatar.closest(PROFILE_SELECTOR) ?? avatar.closest("button, a, [role='button'], [aria-label]") ?? avatar.parentElement;
      if (container) {
        containers.add(container);
      }
    }

    for (const container of containers) {
      maskProfileContainer(container, plan);
    }
  }

  function maskProfileContainer(container, plan) {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    container.setAttribute(PREMIUM_MASK_ATTR, "true");
    container.removeAttribute("title");
    ensurePositioned(container);
    maskAvatar(container, plan);
    maskProfileText(container, plan);
    ensurePlanBadge(container, plan);
  }

  function maskAvatar(container, plan) {
    const avatar = container.matches(AVATAR_SELECTOR) ? container : container.querySelector(AVATAR_SELECTOR);
    if (avatar instanceof HTMLImageElement) {
      if (!avatar.hasAttribute(ORIGINAL_AVATAR_ATTR)) {
        avatar.setAttribute(ORIGINAL_AVATAR_ATTR, avatar.src);
      }
      avatar.src = PREMIUM_AVATAR_URL;
      avatar.setAttribute(PREMIUM_AVATAR_ATTR, "true");
      avatar.alt = `Premium ${plan} Account`;
      return;
    }

    if (!container.querySelector(`[${PREMIUM_AVATAR_ATTR}='true']`)) {
      const fallbackAvatar = document.createElement("span");
      fallbackAvatar.setAttribute(PREMIUM_AVATAR_ATTR, "true");
      fallbackAvatar.setAttribute("aria-hidden", "true");
      container.prepend(fallbackAvatar);
    }
  }

  function maskProfileText(container, plan) {
    for (const element of container.querySelectorAll("span, div, p")) {
      if (!(element instanceof HTMLElement) || element.children.length > 0) {
        continue;
      }

      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text || text.length > 80 || !/\b(free|basic|trial|standard|google account)\b/i.test(text)) {
        continue;
      }

      if (!element.hasAttribute(ORIGINAL_TEXT_ATTR)) {
        element.setAttribute(ORIGINAL_TEXT_ATTR, text);
      }
      element.textContent = `Premium ${plan} Account`;
      break;
    }
  }

  function ensurePlanBadge(container, plan) {
    const existing = container.querySelector(`[${PREMIUM_BADGE_ATTR}='true']`);
    if (existing) {
      if (existing.dataset.plan !== plan) {
        existing.textContent = plan;
        existing.dataset.plan = plan;
      }
      return;
    }

    const badge = document.createElement("span");
    badge.setAttribute(PREMIUM_BADGE_ATTR, "true");
    badge.dataset.plan = plan;
    badge.textContent = plan;
    container.appendChild(badge);
  }

  function ensurePositioned(element) {
    if (window.getComputedStyle(element).position !== "static") {
      return;
    }

    if (!element.hasAttribute(ORIGINAL_POSITION_ATTR)) {
      element.setAttribute(ORIGINAL_POSITION_ATTR, element.style.position);
    }
    element.style.position = "relative";
  }

  function clearPremiumMask() {
    for (const badge of document.querySelectorAll(`[${PREMIUM_BADGE_ATTR}='true']`)) {
      badge.remove();
    }

    for (const avatar of document.querySelectorAll(`[${PREMIUM_AVATAR_ATTR}='true']`)) {
      if (avatar instanceof HTMLImageElement) {
        const originalSrc = avatar.getAttribute(ORIGINAL_AVATAR_ATTR);
        if (originalSrc) {
          avatar.src = originalSrc;
        }
        avatar.removeAttribute(ORIGINAL_AVATAR_ATTR);
        avatar.removeAttribute(PREMIUM_AVATAR_ATTR);
      } else {
        avatar.remove();
      }
    }

    for (const element of document.querySelectorAll(`[${ORIGINAL_TEXT_ATTR}]`)) {
      const originalText = element.getAttribute(ORIGINAL_TEXT_ATTR);
      if (originalText !== null) {
        element.textContent = originalText;
      }
      element.removeAttribute(ORIGINAL_TEXT_ATTR);
    }

    for (const element of document.querySelectorAll(`[${PREMIUM_MASK_ATTR}='true']`)) {
      const originalPosition = element.getAttribute(ORIGINAL_POSITION_ATTR);
      if (originalPosition !== null) {
        element.style.position = originalPosition;
        element.removeAttribute(ORIGINAL_POSITION_ATTR);
      }
      element.removeAttribute(PREMIUM_MASK_ATTR);
    }
  }

  function removeLegacyPanel() {
    document.getElementById(LEGACY_PANEL_ID)?.remove();
    for (const element of document.querySelectorAll("aside, div")) {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.includes("FLOW BRIDGE") && text.includes("Generate cost") && text.includes("Premium lock")) {
        element.remove();
      }
    }
  }

  function isGenerateControl(element) {
    const text = getControlText(element);
    return /\b(generate|create video|start generation)\b/i.test(text);
  }

  async function handleGenerateClick(event, target) {
    if (!state.user || !state.config) {
      // Runner is not authenticated via the extension — block the native click.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToast("Log in from the extension before generating.");
      return;
    }

    if (hasLockedModelSelection() || (shouldLockModelOptions() && lastSelectedModelLocked)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showToast("This model is locked. Select an unlocked model before generating.");
      return;
    }

    const lease = state.activeLease ?? state.dashboard?.activeLease;
    if (!isLeaseLive(lease)) {
      // Session not yet ready — do NOT replay the click programmatically.
      // Instead, block this attempt, surface a clear message, and allow the
      // auto-lease flow (triggerAutoLease) to complete. The runner will click again.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (autoLeasePromise) {
        showToast("Session is being prepared. Please wait and try again.");
      } else {
        showToast("No active session. Refreshing session...");
        void triggerAutoLease();
      }
      return;
    }

    // Active session cookies are already in the profile's cookie jar.
    // Let this native click propagate unmodified — isTrusted: true is preserved.
    markGenerationPending();
    removeLegacyPanel();
  }

  function markGenerationPending() {
    generationSignals.pendingAt = Date.now();
    generationSignals.reported = false;
    generationSignals.released = false;
    generationSignals.releaseInProgress = false;
    generationSignals.reporting = false;
    generationSignals.retryAfter = 0;
  }

  /**
   * Backstop tracker, independent of the DOM size/shape heuristics elsewhere in
   * this file. Walks up from the clicked element a few levels looking for text
   * that names a model; if found, records whether that model is locked (true)
   * or the "[Lower Priority]" exemption (false). handleGenerateClick consults
   * this directly so a click that the row/panel heuristics fail to recognize
   * still can't silently select a locked model for generation.
   */
  function trackModelSelectionClick(eventElement) {
    if (!shouldLockModelOptions()) {
      return;
    }

    let current = eventElement;
    for (let depth = 0; depth < 6 && current; depth += 1) {
      const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text && text.length <= 140 && LOCKED_MODEL_TEXT_PATTERN.test(text)) {
        lastSelectedModelLocked = !isLockedModelText(text);
        return;
      }
      current = current.parentElement;
    }
  }

  function hasLockedModelSelection() {
    if (!shouldLockModelOptions()) {
      return false;
    }

    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      const text = getControlText(element);
      if (!isLockedModelText(text) || findModelOptionsPanel(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width >= 40 && rect.width <= 480 && rect.height >= 16 && rect.height <= 130) {
        return true;
      }
    }

    return false;
  }

  async function detectGenerationStart() {
    if (!generationSignals.pendingAt || generationSignals.released || generationSignals.releaseInProgress) {
      return;
    }

    const pageText = document.body ? (document.body.textContent?.replace(/\s+/g, " ").slice(-4000) ?? "") : "";
    if (hasStrongGenerationSignal(pageText)) {
      generationSignals.releaseInProgress = true;
      const releaseResponse = await chrome.runtime.sendMessage({ type: "RELEASE_USAGE", payload: { submitted: true } }).catch((error) => ({
        ok: false,
        error: { message: error?.message ?? "Lease release failed." }
      }));

      if (releaseResponse?.ok) {
        generationSignals.released = true;
        // Backend now owns provider-inflight tracking; keep the live page session
        // untouched so background polling remains authorized while generation runs.
        clearSessionBadge();
        showToast("Generation submitted. Session tracked.");
      } else {
        showToast(releaseResponse?.error?.message ?? "Lease release failed.");
      }
      generationSignals.releaseInProgress = false;
    }
  }

  function hasStrongGenerationSignal(pageText) {
    const progressbar = document.querySelector("[role='progressbar']");
    const progressNow = Number(progressbar?.getAttribute("aria-valuenow"));
    if (Number.isFinite(progressNow) && progressNow > 0) {
      return true;
    }

    const progressValue = progressbar?.textContent ?? "";
    if (/\b([1-9]|[1-9]\d)%\b/.test(progressValue)) {
      return true;
    }

    return /\b(submitted|queued|in queue|processing request|rendering|uploading assets|generation submitted|generation queued)\b/i.test(pageText);
  }

  async function detectAuthCallbackIssue() {
    const lease = state.activeLease ?? state.dashboard?.activeLease;
    if (!isLeaseLive(lease) || authCallbackReportInFlight || lastAuthCallbackLeaseId === lease.leaseId) {
      return;
    }

    const pageText = document.body ? (document.body.textContent?.replace(/\s+/g, " ").slice(-3000) ?? "") : "";
    const callbackRejected =
      location.pathname.includes("/fx/api/auth/signin") && location.search.includes("error=Callback");
    const wrongAccountPrompt = /\btry signing in with a different account\b/i.test(pageText);

    if (!callbackRejected && !wrongAccountPrompt) {
      return;
    }

    authCallbackReportInFlight = true;
    lastAuthCallbackLeaseId = lease.leaseId;
    showSessionBadge("Preparing session…", "pending");
    showMismatchBanner();

    await chrome.runtime.sendMessage({
      type: "REPORT_USAGE",
      payload: {
        leaseId: lease.leaseId,
        outcome: "AUTH_INVALID",
        providerErrorType: "AUTH_CALLBACK",
        providerMessage: "Session callback was rejected.",
      }
    }).catch(() => undefined);

    authCallbackReportInFlight = false;
    await refreshState();
    showToast("Session is being refreshed. Please retry in a moment.");
  }

  function detectGenerationOutcome() {
    if (
      !generationSignals.pendingAt ||
      generationSignals.reported ||
      generationSignals.reporting ||
      Date.now() < generationSignals.retryAfter
    ) {
      return;
    }

    if (Date.now() - generationSignals.pendingAt > 120000) {
      generationSignals.pendingAt = 0;
      return;
    }

    const pageText = document.body ? (document.body.textContent?.replace(/\s+/g, " ").slice(-4000) ?? "") : "";
    if (/\b(video saved|saved to|generation complete|generated successfully|created)\b/i.test(pageText)) {
      void reportUsage("SUCCESS", "Generation success reported.");
      return;
    }

    if (/\b(generation failed|failed to generate|try again|error generating)\b/i.test(pageText)) {
      void reportUsage("TRANSIENT_ERROR", "Generation issue reported.");
    }
  }

  async function reportUsage(outcome, message, attempt = 1) {
    if (generationSignals.reported || generationSignals.reporting) {
      return;
    }

    generationSignals.reporting = true;
    removeLegacyPanel();
    const response = await chrome.runtime.sendMessage({
      type: "REPORT_USAGE",
      payload: {
        outcome,
        usageUnits: state.config?.creditPolicy?.generationLoopCredits ?? 1
      }
    }).catch((error) => ({
      ok: false,
      error: { message: error?.message ?? "Usage report failed." }
    }));

    if (response?.ok) {
      generationSignals.reported = true;
      generationSignals.reporting = false;
      generationSignals.pendingAt = 0;
      generationSignals.retryAfter = 0;
      await refreshState();
      showToast(message);
    } else {
      generationSignals.reporting = false;
      if (attempt < 3) {
        const delay = 500 * 2 ** (attempt - 1);
        window.setTimeout(() => {
          void reportUsage(outcome, message, attempt + 1);
        }, delay);
        return;
      }

      generationSignals.retryAfter = Date.now() + 15000;
      showToast(response?.error?.message ?? "Usage report failed. Will retry if the page still shows completion.");
    }
  }

  function isLeaseLive(lease) {
    return hasLeaseReadyFor(lease, DEFAULT_LEASE_READY_WINDOW_MS);
  }

  function hasLeaseReadyFor(lease, minReadyMs) {
    if (!lease?.expiresAt) {
      return false;
    }

    const expiresAt = Date.parse(lease.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > Date.now() + minReadyMs;
  }

  function shouldPrepareLease(minReadyMs = DEFAULT_LEASE_READY_WINDOW_MS) {
    if (!state.user || !state.config || autoLeasePromise) {
      return false;
    }

    const lease = state.activeLease ?? state.dashboard?.activeLease;
    return !hasLeaseReadyFor(lease, minReadyMs);
  }

  function getControlText(element) {
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-credit-cost"),
      element.getAttribute("data-parameter-units"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function lockControl(element) {
    element.setAttribute("aria-disabled", "true");
    element.setAttribute(LOCK_ATTR, "true");
    element.classList.add(LOCKED_CLASS);
    element.setAttribute("title", "Locked on Pro plan");

    if (!element.hasAttribute("data-session-bridge-tabindex")) {
      element.setAttribute("data-session-bridge-tabindex", element.getAttribute("tabindex") ?? "");
    }
    element.setAttribute("tabindex", "-1");

    if ("disabled" in element) {
      element.disabled = true;
    }
  }

  function unlockControl(element) {
    element.removeAttribute("aria-disabled");
    element.removeAttribute(LOCK_ATTR);
    element.classList.remove(LOCKED_CLASS);
    element.removeAttribute("title");

    const previousTabIndex = element.getAttribute("data-session-bridge-tabindex");
    if (previousTabIndex !== null) {
      if (previousTabIndex) {
        element.setAttribute("tabindex", previousTabIndex);
      } else {
        element.removeAttribute("tabindex");
      }
      element.removeAttribute("data-session-bridge-tabindex");
    }

    if ("disabled" in element) {
      element.disabled = false;
    }

    for (const badge of element.querySelectorAll(`[${BADGE_ATTR}='true']`)) {
      badge.remove();
    }

    for (const overlay of element.querySelectorAll(`[${MODEL_LOCK_OVERLAY_ATTR}='true']`)) {
      overlay.remove();
    }
  }

  function ensureUiRoot() {
    if (uiRoot) {
      return uiRoot;
    }

    uiHost = document.getElementById(UI_HOST_ID);
    if (!uiHost) {
      uiHost = document.createElement("div");
      uiHost.id = UI_HOST_ID;
      uiHost.style.position = "fixed";
      uiHost.style.inset = "0";
      uiHost.style.zIndex = "2147483647";
      uiHost.style.pointerEvents = "none";
      (document.body || document.documentElement).appendChild(uiHost);
    }

    uiRoot = uiHost.shadowRoot ?? uiHost.attachShadow({ mode: "open" });
    return uiRoot;
  }

  function getUiElementById(id) {
    return ensureUiRoot().getElementById(id);
  }

  function injectStyle() {
    injectPageGateStyle();
    injectShadowUiStyle();
  }

  function injectPageGateStyle() {
    if (document.getElementById("session-bridge-feature-gate-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "session-bridge-feature-gate-style";
    style.textContent = `
      .${LOCKED_CLASS} {
        opacity: 0.46 !important;
        filter: grayscale(1) !important;
        cursor: not-allowed !important;
        position: relative !important;
        user-select: none !important;
      }

      .${LOCKED_CLASS}::after {
        content: "🔒" !important;
        content: "\\1F512" !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px !important;
        height: 18px !important;
        margin-inline-start: 8px !important;
        padding: 0 !important;
        border-radius: 999px !important;
        border: 1px solid rgb(216 255 99 / 0.45) !important;
        background: rgb(216 255 99 / 0.14) !important;
        color: #d8ff63 !important;
        font: 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        vertical-align: middle !important;
        flex: 0 0 auto !important;
      }

      [${MODEL_LOCK_OVERLAY_ATTR}='true'] {
        position: absolute !important;
        inset: 0 !important;
        z-index: 2147483645 !important;
        display: block !important;
        background: transparent !important;
        cursor: not-allowed !important;
        pointer-events: auto !important;
      }

      [${MODEL_LOCK_FIXED_OVERLAY_ATTR}='true'] {
        position: fixed !important;
        z-index: 2147483646 !important;
        display: block !important;
        background: rgb(0 0 0 / 0.01) !important;
        border-radius: 18px !important;
        cursor: not-allowed !important;
        pointer-events: auto !important;
      }

      [${MODEL_LOCK_FIXED_OVERLAY_ATTR}='true']::after {
        content: "\\1F512" !important;
        position: absolute !important;
        right: 28px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 20px !important;
        height: 20px !important;
        border-radius: 999px !important;
        border: 1px solid rgb(216 255 99 / 0.45) !important;
        background: rgb(216 255 99 / 0.14) !important;
        color: #d8ff63 !important;
        font: 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      [${PREMIUM_MASK_ATTR}='true'] {
        overflow: visible !important;
      }

      .${LOCKED_CLASS}[${PREMIUM_MASK_ATTR}='true'],
      [${PREMIUM_MASK_ATTR}='true'] .${LOCKED_CLASS} {
        opacity: 1 !important;
        filter: none !important;
      }

      [${PREMIUM_AVATAR_ATTR}='true'] {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        min-height: 32px !important;
        border-radius: 999px !important;
        object-fit: cover !important;
        border: 2px solid #facc15 !important;
        background-color: #0f172a !important;
        filter: saturate(1.35) contrast(1.08) brightness(1.08) !important;
        box-shadow:
          0 0 0 2px rgb(15 23 42 / 0.92),
          0 0 16px rgb(250 204 21 / 0.72),
          0 0 28px rgb(34 211 238 / 0.42) !important;
      }

      span[${PREMIUM_AVATAR_ATTR}='true'] {
        display: inline-block !important;
        background-image: url("${PREMIUM_AVATAR_URL}") !important;
        background-size: cover !important;
        background-position: center !important;
        flex: 0 0 auto !important;
      }

      [${PREMIUM_BADGE_ATTR}='true'] {
        position: absolute !important;
        right: 43px !important;
        bottom: 13px !important;
        z-index: 2147483646 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 38px !important;
        height: 18px !important;
        padding: 0 6px !important;
        border-radius: 999px !important;
        border: 1px solid rgb(255 255 255 / 0.82) !important;
        background: linear-gradient(135deg, #22d3ee 0%, #8b5cf6 45%, #facc15 100%) !important;
        color: #050816 !important;
        box-shadow:
          0 5px 14px rgb(0 0 0 / 0.34),
          0 0 16px rgb(139 92 246 / 0.58),
          0 0 22px rgb(34 211 238 / 0.34) !important;
        font: 800 10px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
        pointer-events: none !important;
      }

      [${PREMIUM_BADGE_ATTR}='true']::before {
        content: "\\1F512" !important;
        display: inline-block !important;
        margin-right: 3px !important;
        font-size: 9px !important;
        line-height: 1 !important;
      }

      #${LEGACY_PANEL_ID} {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function injectShadowUiStyle() {
    const root = ensureUiRoot();
    if (root.getElementById("session-bridge-shadow-ui-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "session-bridge-shadow-ui-style";
    style.textContent = `
      :host {
        all: initial;
        pointer-events: none;
      }

      #${TOAST_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 12px;
        border-radius: 8px;
        background: #111827;
        color: #f9fafb;
        box-shadow: 0 12px 32px rgb(0 0 0 / 0.22);
        font: 500 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      #${SESSION_BADGE_ID} {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 8px;
        border-radius: 999px;
        font: 600 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
        transition: opacity 0.2s;
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.28);
      }

      #${SESSION_BADGE_ID}[data-badge-type="active"] {
        background: rgb(5 46 22 / 0.92);
        color: #4ade80;
        border: 1px solid rgb(74 222 128 / 0.35);
      }

      #${SESSION_BADGE_ID}[data-badge-type="pending"] {
        background: rgb(30 27 11 / 0.92);
        color: #fbbf24;
        border: 1px solid rgb(251 191 36 / 0.35);
      }

      #${SESSION_BADGE_ID}[data-badge-type="error"] {
        background: rgb(45 8 8 / 0.92);
        color: #f87171;
        border: 1px solid rgb(248 113 113 / 0.35);
      }

      #${SESSION_BADGE_ID}::before {
        content: "";
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        flex: 0 0 auto;
      }

      #${SESSION_BADGE_ID}[data-badge-type="active"]::before {
        box-shadow: 0 0 0 0 currentColor;
        animation: session-badge-pulse 2s ease-in-out infinite;
      }

      @keyframes session-badge-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      #${BANNER_ID} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 10px 16px;
        background: rgb(30 27 11 / 0.96);
        color: #fbbf24;
        border-bottom: 1px solid rgb(251 191 36 / 0.35);
        font: 600 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }

      #${BANNER_RETRY_BUTTON_ID} {
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid rgb(251 191 36 / 0.5);
        background: rgb(251 191 36 / 0.18);
        color: #fbbf24;
        cursor: pointer;
        font: inherit;
      }

      #${BANNER_DISMISS_BUTTON_ID} {
        background: transparent;
        border: none;
        color: #fbbf24;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
    `;
    root.appendChild(style);
  }

  /**
   * Acquires a backend lease and injects session cookies into this clean profile.
   * Called once on page load and again if the runner clicks Generate without a
   * live lease. Deduplicates concurrent calls via the autoLeasePromise guard.
   */
  async function triggerAutoLease() {
    if (autoLeasePromise) return;

    const minReadyMs = requestedLeaseReadyWindowMs;
    const existingLease = state.activeLease ?? state.dashboard?.activeLease;
    if (hasLeaseReadyFor(existingLease, minReadyMs)) {
      requestedLeaseReadyWindowMs = DEFAULT_LEASE_READY_WINDOW_MS;
      showSessionBadge("Session Protected / Active", "active");
      return;
    }

    // Extension is loaded but user has not authenticated via the popup yet.
    if (!state.user || !state.config) {
      requestedLeaseReadyWindowMs = DEFAULT_LEASE_READY_WINDOW_MS;
      return;
    }

    showSessionBadge("Preparing session…", "pending");

    autoLeasePromise = chrome.runtime.sendMessage({ type: "LEASE_ACCOUNT" }).catch((error) => ({
      ok: false,
      error: { message: error?.message ?? "Lease request failed." }
    }));

    const response = await autoLeasePromise;
    autoLeasePromise = null;

    if (!response?.ok) {
      showSessionBadge(response?.error?.message ?? "Session setup failed", "error");
      return;
    }

    if (response.result?.unavailable) {
      const retryAfterMs = calculateAutoLeaseRetryDelay(response.result.retryAfterMs);
      showSessionBadge(response.result.message ?? "Preparing session...", "pending");
      window.clearTimeout(autoLeaseRetryTimer);
      autoLeaseRetryTimer = window.setTimeout(() => {
        autoLeaseRetryTimer = null;
        requestedLeaseReadyWindowMs = Math.max(requestedLeaseReadyWindowMs, minReadyMs);
        void triggerAutoLease();
      }, retryAfterMs);
      return;
    }

    requestedLeaseReadyWindowMs = DEFAULT_LEASE_READY_WINDOW_MS;
    await refreshState();
    showSessionBadge("Session Protected / Active", "active");
  }

  function calculateAutoLeaseRetryDelay(retryAfterMs) {
    const baseDelay = Number(retryAfterMs) || 1500;
    const boundedDelay = Math.max(AUTO_LEASE_RETRY_MIN_MS, Math.min(baseDelay, AUTO_LEASE_RETRY_MAX_MS));
    const jitter = Math.floor(Math.random() * AUTO_LEASE_RETRY_JITTER_MS);
    return boundedDelay + jitter;
  }

  /**
   * Syncs badge visibility with current state after every state refresh.
   * Shows the active badge if a live lease exists, clears it otherwise
   * (unless an auto-lease is already in flight, in which case the pending
   * badge from triggerAutoLease stays visible).
   */
  function updateSessionBadge() {
    const lease = state.activeLease ?? state.dashboard?.activeLease;
    if (isLeaseLive(lease)) {
      showSessionBadge("Session Protected / Active", "active");
      clearMismatchBanner();
    } else if (!autoLeasePromise) {
      clearSessionBadge();
    }
  }

  /**
   * Renders a dedicated top-of-page banner when Google rejects the injected
   * session (account mismatch / auth callback failure), offering a manual
   * "Retry session" action instead of leaving the runner with only a toast.
   */
  function showMismatchBanner() {
    const root = ensureUiRoot();
    let banner = root.getElementById(BANNER_ID);
    if (banner) {
      return;
    }

    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <span>Your session needs to be refreshed.</span>
      <button id="${BANNER_RETRY_BUTTON_ID}" type="button">Retry session</button>
      <button id="${BANNER_DISMISS_BUTTON_ID}" type="button" aria-label="Dismiss">&times;</button>
    `;
    root.appendChild(banner);

    root.getElementById(BANNER_RETRY_BUTTON_ID)?.addEventListener("click", () => {
      // Guard against a duplicate lease: triggerAutoLease() already no-ops via this
      // same check internally, but the explicit guard here is defense-in-depth so a
      // manual retry click can never race an already-in-flight auto-lease loop and
      // pollute Redis inflight counters with a concurrent duplicate session.
      if (autoLeasePromise) {
        return;
      }
      clearMismatchBanner();
      void triggerAutoLease();
    });
    root.getElementById(BANNER_DISMISS_BUTTON_ID)?.addEventListener("click", clearMismatchBanner);
  }

  function clearMismatchBanner() {
    getUiElementById(BANNER_ID)?.remove();
  }

  /**
   * Renders or updates the non-intrusive fixed status badge in the top-right
   * corner of the page overlay.
   *
   * @param {string} text - Label shown to the runner
   * @param {"active"|"pending"|"error"} type - Controls badge colour
   */
  function showSessionBadge(text, type) {
    const root = ensureUiRoot();
    let badge = root.getElementById(SESSION_BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = SESSION_BADGE_ID;
      root.appendChild(badge);
    }
    badge.textContent = text;
    badge.dataset.badgeType = type;
  }

  function clearSessionBadge() {
    getUiElementById(SESSION_BADGE_ID)?.remove();
  }

  function showToast(message) {
    const root = ensureUiRoot();
    let toast = root.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      root.appendChild(toast);
    }

    toast.textContent = message;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => toast.remove(), 2600);
  }

  function showToastThrottled(message) {
    const now = Date.now();
    if (showToastThrottled.lastShownAt && now - showToastThrottled.lastShownAt < 900) {
      return;
    }

    showToastThrottled.lastShownAt = now;
    showToast(message);
  }
})();
