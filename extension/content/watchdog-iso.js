(function watchdogIsolated() {
  if (globalThis.__vidgenWatchdogIsoLoaded) {
    return;
  }
  globalThis.__vidgenWatchdogIsoLoaded = true;

  const HEARTBEAT_INTERVAL_MS = 2000;
  const MARKER_ATTR = "data-vidgen-watchdog-alive";
  const DISCONNECTED_ATTR = "data-vidgen-watchdog-disconnected";

  document.documentElement.setAttribute(MARKER_ATTR, String(Date.now()));

  const intervalId = setInterval(() => {
    if (!isExtensionContextAlive()) {
      clearInterval(intervalId);
      document.documentElement.setAttribute(DISCONNECTED_ATTR, "disconnected");
      return;
    }
    document.documentElement.setAttribute(MARKER_ATTR, String(Date.now()));
  }, HEARTBEAT_INTERVAL_MS);

  function isExtensionContextAlive() {
    try {
      // chrome.runtime.id is undefined once the extension is disabled/removed/reloaded.
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }
})();
