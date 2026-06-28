/* Flow Model Lock
 *
 * Force the Google Flow model picker to expose ONLY
 * "Veo 3.1 - Lite [Lower Priority]" and keep it selected by default.
 * All other model options in the same dropdown are hidden, and the
 * currently-selected model is auto-switched to the allowed one whenever
 * a different option (e.g. "Omni Flash", "Veo 3.1 - Fast", "Veo 2") is
 * active.
 */
(function () {
  "use strict";

  var ALLOWED_LABEL = "Veo 3.1 - Lite [Lower Priority]";

  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  var ALLOWED = norm(ALLOWED_LABEL);

  function textOf(el) {
    try {
      return norm(el.innerText || el.textContent || "");
    } catch (_e) {
      return "";
    }
  }

  // Strict: must contain veo, lite, AND lower priority.
  function isAllowed(t) {
    if (!t) return false;
    if (t === ALLOWED) return true;
    return (
      t.indexOf("veo") !== -1 &&
      /\blite\b/.test(t) &&
      t.indexOf("lower priority") !== -1
    );
  }


  // Anything that looks like a model option text we recognize.
  function looksLikeModelOption(t) {
    if (!t) return false;
    return (
      /\bveo\b/.test(t) ||
      /omni\s*flash/.test(t) ||
      /lower priority/.test(t) ||
      /\bimagen\b/.test(t)
    );
  }

  function listboxContainers() {
    // Listboxes / menus that contain at least one model-like option.
    var hosts = document.querySelectorAll(
      '[role="listbox"],[role="menu"],[role="radiogroup"]'
    );
    var out = [];
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var opts = host.querySelectorAll(
        '[role="option"],[role="menuitem"],[role="menuitemradio"],[role="radio"]'
      );
      var hit = false;
      for (var j = 0; j < opts.length; j++) {
        if (looksLikeModelOption(textOf(opts[j]))) {
          hit = true;
          break;
        }
      }
      if (hit) out.push(host);
    }
    // Fallback: also consider loose document scan when no role host found.
    if (out.length === 0) out.push(document);
    return out;
  }

  function hideOthersIn(host) {
    var opts = host.querySelectorAll(
      '[role="option"],[role="menuitem"],[role="menuitemradio"],[role="radio"]'
    );
    for (var i = 0; i < opts.length; i++) {
      var el = opts[i];
      var t = textOf(el);
      if (!looksLikeModelOption(t)) continue;
      if (isAllowed(t)) {
        el.style.display = "";
        el.removeAttribute("aria-hidden");
      } else if (el.style.display !== "none") {
        el.style.setProperty("display", "none", "important");
        el.setAttribute("aria-hidden", "true");
      }
    }
  }

  // Returns true if `el` is (or sits inside) a dropdown trigger control
  // rather than an option item. We must never hide the trigger button —
  // hiding it removes the model picker entirely from the page.
  function isTriggerLike(el) {
    try {
      var cur = el;
      for (var depth = 0; depth < 4 && cur; depth++) {
        if (cur.getAttribute) {
          if (
            cur.getAttribute("aria-haspopup") ||
            cur.getAttribute("aria-expanded") !== null ||
            cur.getAttribute("role") === "combobox"
          )
            return true;
        }
        cur = cur.parentElement;
      }
    } catch (_e) {}
    return false;
  }

  // Returns true if `el` is inside an open menu/listbox/popover container.
  function isInsidePopup(el) {
    try {
      var cur = el.parentElement;
      while (cur) {
        if (cur.getAttribute) {
          var r = cur.getAttribute("role");
          if (r === "listbox" || r === "menu" || r === "dialog" || r === "radiogroup")
            return true;
          if (cur.getAttribute("aria-expanded") === "true") return true;
        }
        cur = cur.parentElement;
      }
    } catch (_e) {}
    return false;
  }

  // Global sweep: hide popup/menu items whose text is a disallowed model.
  // Skips trigger buttons so the picker control itself stays visible.
  function hideOthersGlobal() {
    var cands = document.querySelectorAll(
      'li,[role="option"],[role="menuitem"],[role="menuitemradio"],[role="radio"]'
    );
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (el.childElementCount > 6) continue;
      if (isTriggerLike(el)) continue;
      var role = el.getAttribute && el.getAttribute("role");
      var isItem =
        role === "option" ||
        role === "menuitem" ||
        role === "menuitemradio" ||
        role === "radio";
      // Plain <li> only counts when inside a popup (otherwise we'd hit page chrome).
      if (!isItem && !isInsidePopup(el)) continue;
      var t = textOf(el);
      if (!t || t.length > 80) continue;
      if (!looksLikeModelOption(t)) continue;
      if (isAllowed(t)) continue;
      if (el.style.display !== "none") {
        el.style.setProperty("display", "none", "important");
        el.setAttribute("aria-hidden", "true");
      }
    }
  }



  function findAllowedOption() {
    var opts = document.querySelectorAll(
      '[role="option"],[role="menuitem"],[role="menuitemradio"],[role="radio"]'
    );
    for (var i = 0; i < opts.length; i++) {
      if (isAllowed(textOf(opts[i]))) return opts[i];
    }
    return null;
  }

  function findModelTrigger() {
    // Buttons / comboboxes whose visible text is a model name.
    var cands = document.querySelectorAll(
      'button,[role="combobox"],[role="button"],[aria-haspopup="listbox"],[aria-haspopup="menu"]'
    );
    for (var i = 0; i < cands.length; i++) {
      var t = textOf(cands[i]);
      if (!t) continue;
      if (looksLikeModelOption(t) && !isAllowed(t)) return cands[i];
    }
    return null;
  }

  // Only switch the selected model if the allowed option already exists in the
  // DOM (i.e. the dropdown is open). Never auto-open or auto-close the picker —
  // that would yank the menu open/closed in the user's face every tick.
  var _switching = false;
  var _attempted = false;
  function ensureDefault() {
    if (_switching) return;
    try {
      var allowed = findAllowedOption();
      if (!allowed) {
        _attempted = false;
        return;
      }
      if (_attempted) return;
      var sel =
        allowed.getAttribute("aria-selected") === "true" ||
        allowed.getAttribute("aria-checked") === "true";
      if (sel) return;
      _switching = true;
      _attempted = true;
      try {
        allowed.click();
      } catch (_e) {}
      setTimeout(function () {
        _switching = false;
      }, 800);
    } catch (_e) {
      _switching = false;
    }
  }


  function tick() {
    try {
      var hosts = listboxContainers();
      for (var i = 0; i < hosts.length; i++) hideOthersIn(hosts[i]);
      hideOthersGlobal();
      ensureDefault();
    } catch (_e) {}
  }

  function start() {
    try {
      tick();
      new MutationObserver(function () {
        tick();
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-selected", "aria-checked", "aria-expanded", "class", "style"],
      });
      setInterval(tick, 1500);
      window.addEventListener("focus", tick);
    } catch (_e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
