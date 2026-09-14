"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User } from "../types/auth";
import { apiClient } from "../lib/api";
import { useRouter } from "next/navigation";
import { getRoleHome } from "../components/auth/ProtectedRoute";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      // On the login entry point there is no session context by definition:
      // skip probing /auth/me to prevent unauthenticated 401 console noise.
      // Server-side middleware already redirects authenticated visitors.
      const onLoginPage =
        typeof window !== "undefined" && window.location.pathname === "/login";
      if (onLoginPage) {
        setUser(null);
        setLoading(false);
        return;
      }

      const res = await apiClient<{ success: boolean; data: { user: User } }>("/auth/me");
      if (res.success && res.data.user) {
        setUser(res.data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiClient<{ success: boolean; data: { user: User } }>("/auth/login", {
        method: "POST",
        data: { email, password },
      });

      if (res.success && res.data.user) {
        setUser(res.data.user);
        setLoading(false);
        router.replace(getRoleHome(res.data.user.role));
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await apiClient("/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      setUser(null);
      setLoading(false);
      router.replace("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
