import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const landingDir = path.join(rootDir, "landing");
const extensionDir = path.join(rootDir, "extension");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

type Step = {
  name: string;
  command: string;
  args: string[];
  cwd: string;
};

function runStep(step: Step) {
  return new Promise<void>((resolve, reject) => {
    console.log("");
    console.log(`==> ${step.name}`);
    console.log(`    cwd: ${step.cwd}`);
    console.log(`    cmd: ${step.command} ${step.args.join(" ")}`);

    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        FORCE_COLOR: "1",
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${step.name} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

function assertExists(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function validateExtensionManifest() {
  const manifestPath = path.join(extensionDir, "manifest.json");
  assertExists(manifestPath, "Extension manifest");
  JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log("Extension manifest JSON is valid.");
}

async function main() {
  assertExists(path.join(rootDir, "package-lock.json"), "Root package lock");
  assertExists(path.join(landingDir, "package-lock.json"), "Landing package lock");
  assertExists(extensionDir, "Extension directory");

  const steps: Step[] = [
    {
      name: "Clean install backend dependencies",
      command: npmBin,
      args: ["ci"],
      cwd: rootDir,
    },
    {
      name: "Build backend",
      command: npmBin,
      args: ["run", "build"],
      cwd: rootDir,
    },
    {
      name: "Run backend tests",
      command: npmBin,
      args: ["test"],
      cwd: rootDir,
    },
  ];

  for (const step of steps) {
    await runStep(step);
  }

  console.log("");
  console.log("==> Validate Chrome extension");
  validateExtensionManifest();

  const extensionScripts = [
    path.join(extensionDir, "background", "service-worker.js"),
    path.join(extensionDir, "popup", "popup.js"),
    path.join(extensionDir, "content", "env-compat-main.js"),
    path.join(extensionDir, "content", "watchdog-main.js"),
    path.join(extensionDir, "content", "watchdog-iso.js"),
    path.join(extensionDir, "content", "flow-gate.js"),
    path.join(extensionDir, "content", "auto-signout-iso.js"),
    path.join(extensionDir, "content", "feature-gate.js"),
    path.join(extensionDir, "content", "env-compat-fixture.js"),
  ];

  for (const scriptPath of extensionScripts) {
    await runStep({
      name: `Syntax check ${path.relative(rootDir, scriptPath)}`,
      command: nodeBin,
      args: ["--check", scriptPath],
      cwd: rootDir,
    });
  }

  const landingSteps: Step[] = [
    {
      name: "Clean install landing dependencies",
      command: npmBin,
      args: ["ci"],
      cwd: landingDir,
    },
    {
      name: "Build landing page",
      command: npmBin,
      args: ["run", "build"],
      cwd: landingDir,
    },
  ];

  for (const step of landingSteps) {
    await runStep(step);
  }

  console.log("");
  console.log("All modules built and verified successfully.");
}

main().catch((error: unknown) => {
  console.error("");
  console.error("Build-all failed");
  console.error("================");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
