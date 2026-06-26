import { describe, expect, it } from "vitest";
import {
  assertSubscriptionActive,
  getAccessStatus,
  getComputedUserStatus,
  getDaysRemaining,
  toUserDashboardSummary,
} from "../src/modules/subscriptions/subscription.service.js";

const now = new Date("2026-06-02T00:00:00.000Z");

describe("subscription status helpers", () => {
  it("computes active users from validUntil", () => {
    const user = { validUntil: new Date("2026-06-03T00:00:00.000Z"), isManuallyDisabled: false };

    expect(getComputedUserStatus(user, now)).toBe("ACTIVE");
    expect(getAccessStatus(user, now)).toBe("ACTIVE");
    expect(getDaysRemaining(user, now)).toBe(1);
  });

  it("computes system expired users from validUntil", () => {
    const user = { validUntil: new Date("2026-06-01T23:59:59.000Z"), isManuallyDisabled: false };

    expect(getComputedUserStatus(user, now)).toBe("EXPIRED");
    expect(getAccessStatus(user, now)).toBe("SYSTEM_EXPIRED");
    expect(getDaysRemaining(user, now)).toBe(0);
  });

  it("manual disable overrides otherwise active users", () => {
    const user = { validUntil: new Date("2026-06-30T00:00:00.000Z"), isManuallyDisabled: true };

    expect(getComputedUserStatus(user, now)).toBe("ACTIVE");
    expect(getAccessStatus(user, now)).toBe("MANUALLY_DISABLED");
    expect(() => assertSubscriptionActive(user)).toThrow("Account manually disabled");
  });

  it("adds dashboard-only virtual fields without mutating database state", () => {
    const user = {
      id: "u1",
      validUntil: new Date("2026-06-01T00:00:00.000Z"),
      isManuallyDisabled: false,
    };

    expect(toUserDashboardSummary(user, now)).toMatchObject({
      id: "u1",
      status: "EXPIRED",
      accessStatus: "SYSTEM_EXPIRED",
      systemExpired: true,
      manualDisable: false,
      daysRemaining: 0,
    });
  });
});
