import { badRequest } from "../../utils/errors.js";

const workspaceHosts = ["labs.google", "labs.google.com"];
// Confirmed via real-browser testing: session-token alone is sufficient for both
// page load and video generation — csrf-token/callback-url are not load-bearing.
const NEXT_AUTH_COOKIE_NAMES = ["__Secure-next-auth.session-token"];

type CookieLike = {
  domain?: unknown;
  name?: unknown;
  path?: unknown;
  url?: unknown;
  value?: unknown;
};

export type VaultValidationSummary = {
  cookieCount: number;
  hasAllNextAuthCookies: boolean;
  missingNextAuthCookies: string[];
};

export function validateCompleteVaultData(vaultData?: string | null): VaultValidationSummary | null {
  if (!vaultData) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(vaultData);
  } catch {
    throw badRequest("vaultData must be valid JSON", "INVALID_VAULT_DATA");
  }

  const cookies = Array.isArray(parsed) ? parsed : [parsed];
  const validCookies = cookies.filter(isValidCookie);

  if (validCookies.length === 0) {
    throw badRequest("vaultData must include at least one valid cookie", "INVALID_VAULT_DATA");
  }

  const presentNames = new Set(
    validCookies
      .filter((cookie) => hostMatches(cookieHost(cookie), workspaceHosts))
      .map((cookie) => cookie.name as string),
  );
  const missingNextAuthCookies = NEXT_AUTH_COOKIE_NAMES.filter((name) => !presentNames.has(name));
  const summary: VaultValidationSummary = {
    cookieCount: validCookies.length,
    hasAllNextAuthCookies: missingNextAuthCookies.length === 0,
    missingNextAuthCookies,
  };

  if (!summary.hasAllNextAuthCookies) {
    throw badRequest(
      "vaultData is missing required NextAuth cookies (" + missingNextAuthCookies.join(", ") + "). Open the target workspace in the keeper profile and sync again.",
      "INCOMPLETE_VAULT_DATA",
    );
  }

  return summary;
}

function isValidCookie(cookie: unknown): cookie is CookieLike {
  if (!cookie || typeof cookie !== "object") {
    return false;
  }

  const candidate = cookie as CookieLike;
  return typeof candidate.name === "string" && candidate.name.length > 0 && typeof candidate.value === "string";
}

function cookieHost(cookie: CookieLike) {
  if (typeof cookie.url === "string" && cookie.url) {
    try {
      return new URL(cookie.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  if (typeof cookie.domain !== "string") {
    return "";
  }

  return cookie.domain.replace(/^\./, "").toLowerCase();
}

function hostMatches(host: string, expectedHosts: string[]) {
  return expectedHosts.some((expected) => host === expected || host.endsWith(`.${expected}`));
}
