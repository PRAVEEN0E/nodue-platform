import { connectRedis, disconnectRedis, redis } from "../src/plugins/redis";

async function main() {
  await connectRedis();
  const keys = await redis.keys("nodue-ratelimit-*");
  console.log(`ratelimit keys: ${keys.length}`);
  for (const k of keys.slice(0, 5)) console.log(" ", k);
}

main().finally(() => disconnectRedis());
