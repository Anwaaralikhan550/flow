import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Anti-tamper watchdog (dual-world)", () => {
  it("registers both watchdog content scripts in the correct worlds", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));

    const isoEntry = manifest.content_scripts.find((cs: any) =>
      cs.js.includes("content/watchdog-iso.js")
    );
    const mainEntry = manifest.content_scripts.find((cs: any) =>
      cs.js.includes("content/watchdog-main.js")
    );

    expect(isoEntry).toBeTruthy();
    expect(isoEntry.matches).toContain("https://labs.google/fx/tools/flow*");
    expect(isoEntry.run_at).toBe("document_start");
    expect(isoEntry.world).toBe("ISOLATED");

    expect(mainEntry).toBeTruthy();
    expect(mainEntry.matches).toContain("https://labs.google/fx/tools/flow*");
    expect(mainEntry.run_at).toBe("document_start");
    expect(mainEntry.world).toBe("MAIN");
  });

  it("watchdog-iso.js detects extension-context death via chrome.runtime.id and flags it via a DOM attribute", () => {
    const source = readFileSync("extension/content/watchdog-iso.js", "utf8");

    expect(source).toContain("chrome.runtime.id");
    expect(source).toContain('setAttribute(DISCONNECTED_ATTR, "disconnected")');
    expect(source).not.toContain("CustomEvent");
    expect(source).not.toContain("dispatchEvent");
  });

  it("watchdog-main.js polls the DOM attribute (no chrome.runtime access, no CustomEvent)", () => {
    const source = readFileSync("extension/content/watchdog-main.js", "utf8");

    expect(source).toContain("getAttribute(DISCONNECTED_ATTR)");
    expect(source).toContain("position:fixed");
    expect(source).toContain("inset:0");
    expect(source).not.toContain("chrome.runtime");
    expect(source).not.toContain("CustomEvent");
    expect(source).not.toContain("dispatchEvent");
  });

  it("appends the lock overlay to documentElement, not body (body may not exist at document_start)", () => {
    const source = readFileSync("extension/content/watchdog-main.js", "utf8");

    expect(source).toContain("document.documentElement.appendChild(overlay)");
    expect(source).not.toContain("document.body.appendChild(overlay)");
  });
});
