(function watchdogMain() {
  if (window.__vidgenWatchdogMainLoaded) {
    return;
  }
  window.__vidgenWatchdogMainLoaded = true;

  const MARKER_ATTR = "data-vidgen-watchdog-alive";
  const DISCONNECTED_ATTR = "data-vidgen-watchdog-disconnected";
  const STALE_THRESHOLD_MS = 6000;
  const CHECK_INTERVAL_MS = 2000;
  const STARTUP_GRACE_MS = 4000;
  const OVERLAY_ID = "__flow_fatal_lock__";

  // Coordination with watchdog-iso.js is DOM-attribute-only: MAIN and ISOLATED
  // worlds cannot safely pass structured event payloads across the boundary
  // (risks "Uncaught DoNotLeakObject" / silently dropped events). This loop
  // polls the same two attributes the ISOLATED script writes.
  setTimeout(() => {
    const intervalId = setInterval(() => {
      // Fast path: ISOLATED explicitly flagged disconnection via the DOM attribute.
      if (document.documentElement.getAttribute(DISCONNECTED_ATTR)) {
        clearInterval(intervalId);
        renderLockOverlay("disconnected");
        return;
      }

      // Fail-safe path: heartbeat went stale without an explicit flag (e.g. the
      // ISOLATED script's own execution was killed outright, not just the extension API).
      const lastBeat = Number(document.documentElement.getAttribute(MARKER_ATTR));
      if (!Number.isFinite(lastBeat) || Date.now() - lastBeat > STALE_THRESHOLD_MS) {
        clearInterval(intervalId);
        renderLockOverlay("stale-heartbeat");
      }
    }, CHECK_INTERVAL_MS);
  }, STARTUP_GRACE_MS);

  function renderLockOverlay(reason) {
    if (document.getElementById(OVERLAY_ID)) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("data-reason", reason);
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(5,8,15,0.97);color:#f9fafb;" +
      "display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;" +
      "text-align:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    overlay.innerHTML = `
      <div style="font-size:18px;font-weight:700;">Session protection was interrupted</div>
      <div style="font-size:14px;opacity:0.8;max-width:420px;">The Vidgen Flow extension appears to have been disabled or removed. Please reload this page with the extension enabled to continue.</div>
    `;
    document.documentElement.appendChild(overlay);

    // Defensive: re-append if the page tries to remove it.
    new MutationObserver(() => {
      if (!document.getElementById(OVERLAY_ID)) {
        document.documentElement.appendChild(overlay);
      }
    }).observe(document.documentElement, { childList: true });
  }
})();
