import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on("error", (err) => {
  console.warn("⚠️ Redis warning/error:", err.message);
});

// Dedicated client for the distributed rate limiter (shared counters across
// backend instances). Tight failure budget: a degraded Redis must fail fast
// so request handling never queues behind store retries (the limiter is
// configured to skip on store errors — see app.ts for the rationale).
export const rateLimitRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
  enableReadyCheck: true,
  lazyConnect: true,
});

rateLimitRedis.on("error", (err) => {
  console.warn("⚠️ Rate-limit Redis warning/error:", err.message);
});

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      console.warn(`Redis get error for key ${key}:`, err);
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.set(key, serialized, "EX", ttlSeconds);
      } else {
        await redis.set(key, serialized);
      }
    } catch (err) {
      console.warn(`Redis set error for key ${key}:`, err);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`Redis del error for key ${key}:`, err);
    }
  },

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      console.warn(`Redis invalidatePattern error for ${pattern}:`, err);
    }
  },
};

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    console.log("✅ Redis connected successfully");
  } catch (err) {
    console.warn("⚠️ Redis connection failed on startup, caching will fallback gracefully:", (err as Error).message);
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await rateLimitRedis.quit();
  } catch {
    rateLimitRedis.disconnect();
  }
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const res = await redis.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}
