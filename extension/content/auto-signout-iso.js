(async function autoSignoutInterceptor() {
  if (globalThis.__vidgenAutoSignoutLoaded) {
    return;
  }
  globalThis.__vidgenAutoSignoutLoaded = true;

  // 1. Do all async cleanup FIRST, while the page context is guaranteed stable.
  //    Submitting the signout form below triggers navigation, which destroys
  //    this context mid-flight — nothing that depends on it may run after it.
  await deepWipeStorage();
  await chrome.runtime.sendMessage({ type: "AUTO_SIGNOUT_DETECTED" }).catch(() => undefined);

  // 2. Only now allow the actual signout submission/navigation to proceed.
  completeSignoutFlowIfPresent();
  const observer = new MutationObserver(() => completeSignoutFlowIfPresent());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Stop watching after a generous window so the observer doesn't run forever
  // if the signout page never renders a form/button (e.g. already complete).
  setTimeout(() => observer.disconnect(), 15000);

  function completeSignoutFlowIfPresent() {
    const form = document.querySelector("form[action*='signout' i], form#signout-form");
    if (form instanceof HTMLFormElement) {
      observer.disconnect();
      form.submit();
      return;
    }

    const button = document.querySelector(
      "button[type='submit'], [data-testid*='signout' i], [aria-label*='sign out' i]"
    );
    if (button instanceof HTMLElement) {
      observer.disconnect();
      button.click();
    }
  }

  async function deepWipeStorage() {
    try {
      localStorage.clear();
    } catch {
      // storage may be partitioned/blocked; non-fatal
    }

    try {
      sessionStorage.clear();
    } catch {
      // same
    }

    try {
      if (self.indexedDB?.databases) {
        const databases = await self.indexedDB.databases();
        await Promise.all(
          databases.map((db) =>
            db.name
              ? new Promise((resolve) => {
                  const request = indexedDB.deleteDatabase(db.name);
                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                })
              : Promise.resolve()
          )
        );
      }
    } catch {
      // non-fatal
    }

    try {
      if (self.caches?.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // non-fatal
    }
  }
})();
