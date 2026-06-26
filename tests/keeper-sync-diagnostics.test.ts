import { describe, expect, it, vi } from "vitest";
import { logNextAuthCookieNames } from "../src/modules/master-accounts/master-account-keeper.routes.js";

describe("Keeper-sync NextAuth cookie diagnostic logging", () => {
  it("flags NextAuth-style cookie names without leaking values", () => {
    const secretValue = "super-secret-session-value";
    const log = { info: vi.fn() } as any;
    const vaultData = JSON.stringify([
      { name: "__Secure-next-auth.session-token", value: secretValue, domain: "labs.google", path: "/" },
      { name: "SID", value: "account-cookie", domain: ".google.com", path: "/" },
    ]);

    logNextAuthCookieNames(log, vaultData);

    expect(log.info).toHaveBeenCalledTimes(1);
    const [payload, message] = log.info.mock.calls[0];
    expect(message).toBe("keeper-sync vault cookie names captured (diagnostic)");
    expect(payload.hasNextAuthCookies).toBe(true);
    expect(payload.nextAuthCookieNames).toEqual(["__Secure-next-auth.session-token"]);
    expect(payload.allCookieNames).toEqual(["__Secure-next-auth.session-token", "SID"]);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(secretValue);
  });

  it("reports hasNextAuthCookies as false when no NextAuth cookies are present", () => {
    const log = { info: vi.fn() } as any;
    const vaultData = JSON.stringify([
      { name: "SID", value: "account-cookie", domain: ".google.com", path: "/" },
      { name: "OSID", value: "workspace-cookie", domain: "labs.google", path: "/" },
    ]);

    logNextAuthCookieNames(log, vaultData);

    const [payload] = log.info.mock.calls[0];
    expect(payload.hasNextAuthCookies).toBe(false);
    expect(payload.nextAuthCookieNames).toEqual([]);
  });

  it("does not throw or log on invalid JSON", () => {
    const log = { info: vi.fn() } as any;
    logNextAuthCookieNames(log, "not-json");
    expect(log.info).not.toHaveBeenCalled();
  });
});
