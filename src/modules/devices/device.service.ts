import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { forbidden } from "../../utils/errors.js";
import { DeviceRepository } from "./device.repository.js";

const MAX_DEVICES_PER_USER = 2;

export class DeviceService {
  private readonly repository: DeviceRepository;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    this.repository = new DeviceRepository(prisma);
  }

  async registerDevice(userId: string, fingerprintId: string) {
    const lockKey = `lock:user:${userId}:devices`;
    const lockValue = `${Date.now()}:${Math.random()}`;
    const lockAcquired = await this.redis.set(lockKey, lockValue, "EX", 5, "NX");

    if (!lockAcquired) {
      throw forbidden("Device registration is busy. Try again.", "DEVICE_LOCK_BUSY");
    }

    try {
      const key = this.devicesKey(userId);
      await this.ensureDeviceCache(userId);

      const exists = await this.redis.sismember(key, fingerprintId);
      if (exists) {
        await this.repository.touch(userId, fingerprintId);
        return;
      }

      const count = await this.redis.scard(key);
      if (count >= MAX_DEVICES_PER_USER) {
        await this.replaceOldestDevice(userId, key);
      }

      await this.repository.create(userId, fingerprintId);
      await this.redis.sadd(key, fingerprintId);
      await this.redis.expire(key, env.DEVICE_CACHE_TTL_SECONDS);
    } finally {
      const currentLockValue = await this.redis.get(lockKey);
      if (currentLockValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  private async replaceOldestDevice(userId: string, cacheKey: string) {
    const devices = await this.repository.findByUser(userId);
    const oldestDevice = devices[0];

    if (!oldestDevice) {
      await this.redis.del(cacheKey);
      return;
    }

    await this.repository.delete(userId, oldestDevice.fingerprintId);
    await this.redis.srem(cacheKey, oldestDevice.fingerprintId);
  }

  async verifyRegisteredDevice(userId: string, fingerprintId: string) {
    const key = this.devicesKey(userId);
    await this.ensureDeviceCache(userId);

    const exists = await this.redis.sismember(key, fingerprintId);
    if (!exists) {
      throw forbidden("Device is not registered for this user", "DEVICE_NOT_REGISTERED");
    }
  }

  private devicesKey(userId: string) {
    return `user:${userId}:devices`;
  }

  private async ensureDeviceCache(userId: string) {
    const key = this.devicesKey(userId);
    const exists = await this.redis.exists(key);
    if (exists) {
      return;
    }

    const devices = await this.repository.findByUser(userId);
    if (devices.length > 0) {
      await this.redis.sadd(
        key,
        ...devices.map((device) => device.fingerprintId),
      );
    } else {
      await this.redis.sadd(key, "__empty__");
      await this.redis.srem(key, "__empty__");
    }
    await this.redis.expire(key, env.DEVICE_CACHE_TTL_SECONDS);
  }
}
