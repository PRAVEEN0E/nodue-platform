import { apiClient } from "./api";
import { UserSession } from "../types/auth";

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  keepCurrentSession?: boolean;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ message: string }> {
  const res = await apiClient<{ success: boolean; data: { message: string } }>("/auth/change-password", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export async function getActiveSessions(): Promise<UserSession[]> {
  const res = await apiClient<{ success: boolean; data: { sessions: UserSession[] } }>("/auth/sessions");
  return res.data?.sessions ?? [];
}

export async function revokeSession(sessionId: string): Promise<{ message: string; isCurrent: boolean }> {
  const res = await apiClient<{ success: boolean; data: { message: string; isCurrent: boolean } }>(
    `/auth/sessions/${sessionId}`,
    {
      method: "DELETE",
    }
  );
  return res.data;
}

export async function revokeAllSessions(
  keepCurrentSession: boolean = true
): Promise<{ message: string; revokedCount: number; isCurrentLoggedOut: boolean }> {
  const res = await apiClient<{
    success: boolean;
    data: { message: string; revokedCount: number; isCurrentLoggedOut: boolean };
  }>("/auth/sessions/revoke-all", {
    method: "POST",
    data: { keepCurrentSession },
  });
  return res.data;
}
