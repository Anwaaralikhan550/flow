import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

/**
 * Produces a minified/obfuscated copy of `extension/` at `extension-dist/`,
 * which is what gets zipped and distributed publicly (vidgen.fun/downloads).
 * `extension/` stays untouched as the readable dev source — tests in
 * tests/extension-lifecycle.test.ts assert against it directly. This is a
 * pure build/packaging step: it changes only how the code reads on disk, not
 * what it does at runtime. The obfuscator's identifier renaming, string-array
 * encoding, and dead-code injection are all semantics-preserving by design.
 *
 * Why this exists: our public download zip currently ships flow-gate.js and
 * service-worker.js as plain, fully readable source — anyone can unzip it and
 * read the exact round-robin leasing logic, the model-lock bypass pattern, the
 * vault cookie names, etc. (We did exactly this to a competitor's extension
 * earlier — same risk applies to us in reverse.)
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "extension");
const distDir = path.join(rootDir, "extension-dist");

const JS_DIRS = ["background", "content", "popup"];

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  identifierNamesGenerator: "hexadecimal" as const,
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ["base64" as const],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  simplify: true,
  // MV3 service workers and content scripts run under a strict CSP that
  // forbids unsafe-eval. selfDefending/debugProtection both rely on Function
  // constructor / eval-style tricks and would break the extension outright.
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  // Renaming away from MV3-required global hooks (chrome.*, globalThis.* flags)
  // would break the extension; only local identifiers are safe to rename.
  reservedNames: ["^chrome$"],
};

function main() {
  if (!existsSync(srcDir)) {
    throw new Error(`Extension source directory not found: ${srcDir}`);
  }

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  // Copy everything first (manifest.json, HTML, CSS, icons, etc.) — these are
  // either non-executable or already opaque (images), nothing to obfuscate.
  cpSync(srcDir, distDir, { recursive: true });

  let obfuscatedCount = 0;
  for (const dir of JS_DIRS) {
    const dirPath = path.join(distDir, dir);
    if (!existsSync(dirPath)) {
      continue;
    }
    obfuscatedCount += obfuscateJsFilesIn(dirPath);
  }

  console.log(`extension-dist built: ${obfuscatedCount} JS file(s) obfuscated, manifest/html/css/icons copied as-is.`);
  console.log(`Output: ${distDir}`);
}

function obfuscateJsFilesIn(dirPath: string): number {
  let count = 0;

  for (const entry of readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    if (statSync(entryPath).isDirectory()) {
      count += obfuscateJsFilesIn(entryPath);
      continue;
    }

    if (!entry.endsWith(".js")) {
      continue;
    }

    const source = readFileSync(entryPath, "utf8");
    const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS);
    writeFileSync(entryPath, result.getObfuscatedCode(), "utf8");
    count += 1;
  }

  return count;
}

main();
