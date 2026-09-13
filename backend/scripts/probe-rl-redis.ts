import { rateLimitRedis, disconnectRedis } from "../src/plugins/redis";

async function main() {
  try {
    const pong = await rateLimitRedis.ping();
    console.log("ping:", pong);
  } catch (e) {
    console.log("ping FAILED:", (e as Error).message);
  }
  try {
    const n = await rateLimitRedis.incr("nodue-probe-key");
    console.log("incr ok:", n);
    await rateLimitRedis.del("nodue-probe-key");
  } catch (e) {
    console.log("incr FAILED:", (e as Error).message);
  }
  try {
    rateLimitRedis.defineCommand("probeRateLimit", {
      numberOfKeys: 1,
      lua: "local c = redis.call('INCR', KEYS[1]); return {c};",
    });
    const r = await (rateLimitRedis as unknown as { probeRateLimit: (k: string) => Promise<unknown> }).probeRateLimit(
      "nodue-probe-lua"
    );
    console.log("lua ok:", JSON.stringify(r));
    await rateLimitRedis.del("nodue-probe-lua");
  } catch (e) {
    console.log("lua FAILED:", (e as Error).message);
  }
}

main().finally(() => disconnectRedis());
