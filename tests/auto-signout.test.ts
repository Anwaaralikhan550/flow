import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Auto-signout interception and deep storage wipe", () => {
  it("registers the signout content script in the manifest", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
    const entry = manifest.content_scripts.find((cs: any) =>
      cs.matches.includes("https://labs.google/fx/api/auth/signout*")
    );

    expect(entry).toBeTruthy();
    expect(entry.js).toContain("content/auto-signout-iso.js");
    expect(entry.run_at).toBe("document_start");
  });

  it("wipes localStorage, sessionStorage, IndexedDB, and Cache API", () => {
    const source = readFileSync("extension/content/auto-signout-iso.js", "utf8");

    expect(source).toContain("localStorage.clear()");
    expect(source).toContain("sessionStorage.clear()");
    expect(source).toContain("indexedDB.databases()");
    expect(source).toContain("caches.keys()");
  });

  it("completes async cleanup BEFORE submitting the signout form (race-condition fix)", () => {
    const source = readFileSync("extension/content/auto-signout-iso.js", "utf8");

    const wipeIndex = source.indexOf("await deepWipeStorage()");
    const messageIndex = source.indexOf("await chrome.runtime.sendMessage");
    const submitCallIndex = source.indexOf("completeSignoutFlowIfPresent();");

    expect(wipeIndex).toBeGreaterThan(-1);
    expect(messageIndex).toBeGreaterThan(-1);
    expect(submitCallIndex).toBeGreaterThan(-1);
    expect(wipeIndex).toBeLessThan(submitCallIndex);
    expect(messageIndex).toBeLessThan(submitCallIndex);
  });

  it("routes AUTO_SIGNOUT_DETECTED to a handler that clears lease state before releasing the backend lease", () => {
    const source = readFileSync("extension/background/service-worker.js", "utf8");

    expect(source).toContain('case "AUTO_SIGNOUT_DETECTED":');
    expect(source).toContain("async function handleAutoSignout()");

    const start = source.indexOf("async function handleAutoSignout()");
    const end = source.indexOf("async function clearTargetSessionCookies()");
    const body = source.slice(start, end);

    const clearIndex = body.indexOf("await clearActiveLeaseState()");
    const releaseIndex = body.indexOf("await releaseUsage(");

    expect(clearIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeLessThan(releaseIndex);
  });
});
