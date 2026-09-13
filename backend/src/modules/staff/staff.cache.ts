import { cacheService } from "../../plugins/redis";

// Staff caches are scoped per staff member so a change to one staff member
// never leaks into another's view. Keys are derived from the staff user id so
// invalidation is possible from advisor/admin services that only know the
// staff profile.
export const staffDashboardCacheKey = (userId: string) => `cache:staff:dashboard:${userId}`;
export const staffClassesCacheKey = (userId: string) => `cache:staff:classes:${userId}`;

export function staffCacheKeys(userId: string): string[] {
  return [staffDashboardCacheKey(userId), staffClassesCacheKey(userId)];
}

export async function invalidateStaffCache(userId: string): Promise<void> {
  for (const key of staffCacheKeys(userId)) {
    await cacheService.del(key);
  }
}