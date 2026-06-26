import type { User } from "@prisma/client";
import { forbidden, paymentRequired } from "../../utils/errors.js";

const dayMs = 24 * 60 * 60 * 1000;

export type ComputedUserStatus = "ACTIVE" | "EXPIRED";
export type AccessStatus = "ACTIVE" | "SYSTEM_EXPIRED" | "MANUALLY_DISABLED";

export function getComputedUserStatus(user: Pick<User, "validUntil">, now = new Date()): ComputedUserStatus {
  return user.validUntil.getTime() > now.getTime() ? "ACTIVE" : "EXPIRED";
}

export function getDaysRemaining(user: Pick<User, "validUntil">, now = new Date()) {
  return Math.max(0, Math.ceil((user.validUntil.getTime() - now.getTime()) / dayMs));
}

export function getAccessStatus(
  user: Pick<User, "validUntil" | "isManuallyDisabled">,
  now = new Date(),
): AccessStatus {
  if (user.isManuallyDisabled) {
    return "MANUALLY_DISABLED";
  }

  return getComputedUserStatus(user, now) === "ACTIVE" ? "ACTIVE" : "SYSTEM_EXPIRED";
}

export function toUserDashboardSummary<T extends Pick<User, "validUntil" | "isManuallyDisabled">>(user: T, now = new Date()) {
  return {
    ...user,
    status: getComputedUserStatus(user, now),
    accessStatus: getAccessStatus(user, now),
    systemExpired: getComputedUserStatus(user, now) === "EXPIRED",
    manualDisable: user.isManuallyDisabled,
    daysRemaining: getDaysRemaining(user, now),
  };
}

export function assertSubscriptionActive(user: Pick<User, "validUntil" | "isManuallyDisabled">) {
  if (user.isManuallyDisabled) {
    throw forbidden("Account manually disabled", "MANUALLY_DISABLED");
  }

  if (Date.now() > user.validUntil.getTime()) {
    throw paymentRequired("Subscription Expired", "SUBSCRIPTION_EXPIRED");
  }
}
