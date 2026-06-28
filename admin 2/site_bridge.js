(function () {
  "use strict";

  var AUTH_KEY = "__flow_auth__";
  var ATTR = "data-flow-ext";
  var lastAuthSent = "";
  var pending = 0;

  function hasRuntime() {
    try {
      return (
        typeof chrome !== "undefined" &&
        !!chrome.runtime &&
        !!chrome.runtime.id &&
        typeof chrome.runtime.sendMessage === "function"
      );
    } catch (_e) {
      return false;
    }
  }

  function sendMessage(message) {
    if (!hasRuntime()) return;
    try {
      chrome.runtime.sendMessage(message, function () {
        try {
          void chrome.runtime.lastError;
        } catch (_e) {}
      });
    } catch (_e) {}
  }

  function markInstalled() {
    try {
      if (document && document.documentElement) {
        document.documentElement.setAttribute(ATTR, "1");
      }
    } catch (_e) {}
  }

  function scheduleAuth(delay) {
    if (pending) return;
    pending = setTimeout(function () {
      pending = 0;
      sendAuthIfChanged();
    }, delay || 150);
  }

  function sendAuthIfChanged() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw || raw === lastAuthSent) return;
      var payload = JSON.parse(raw);
      if (!payload || !payload.userId) return;
      lastAuthSent = raw;
      sendMessage({
        type: "SITE_AUTH",
        data: Object.assign({}, payload, { apiBase: window.location.origin }),
      });
    } catch (_e) {}
  }

  markInstalled();
  sendAuthIfChanged();

  var attempts = 0;
  var poll = setInterval(function () {
    attempts++;
    sendAuthIfChanged();
    if (lastAuthSent || attempts >= 20) {
      clearInterval(poll);
    }
  }, 500);

  try {
    window.addEventListener("FLOW_EXT_PING", function () {
      try {
        window.dispatchEvent(new CustomEvent("FLOW_EXT_PONG", { detail: { ok: true } }));
      } catch (_e) {}
    });
  } catch (_e) {}

  try {
    window.addEventListener("FLOW_OPEN_VIDEO", function (event) {
      try {
        if (event && event.detail && event.detail.url) {
          sendMessage({ type: "OPEN_VIDEO", url: event.detail.url });
        }
      } catch (_e) {}
    });
  } catch (_e) {}

  try {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        scheduleAuth(50);
      },
      { once: true }
    );
  } catch (_e) {}

  try {
    window.addEventListener("storage", function (event) {
      if (event && event.key === AUTH_KEY) {
        lastAuthSent = "";
        scheduleAuth(50);
      }
    });
  } catch (_e) {}
})();
