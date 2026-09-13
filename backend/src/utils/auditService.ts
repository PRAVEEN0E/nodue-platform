import { prisma } from "../plugins/database";
import { Prisma } from "@prisma/client";

export interface CreateAuditLogParams {
  actorUserId?: string | null;
  departmentId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const auditService = {
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorUserId: params.actorUserId || null,
          departmentId: params.departmentId || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          metadata: params.metadata || Prisma.JsonNull,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
        },
      });
    } catch (err) {
      // Non-blocking: audit failure should never crash critical paths, but should be logged to stderr
      console.error("❌ Failed to write audit log:", err);
    }
  },
};
