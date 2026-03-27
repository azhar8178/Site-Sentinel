import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getBaseUrl } from "@/utils/getBaseUrl";

type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isEditor: boolean;
  canEditConfig: boolean;
  canManageUsers: boolean;
}

let _onUnauthorized: (() => void) | null = null;
let _logoutInFlight = false;

export function onApiUnauthorized() {
  if (_logoutInFlight) return;
  _logoutInFlight = true;
  _onUnauthorized?.();
  setTimeout(() => { _logoutInFlight = false; }, 2000);
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

const baseUrl = getBaseUrl();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const savedUser = await AsyncStorage.getItem(USER_KEY);
        if (savedToken && savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed.isAdmin !== undefined && !parsed.role) {
            parsed.role = parsed.isAdmin ? "admin" : "editor";
            delete parsed.isAdmin;
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(parsed));
          }
          setToken(savedToken);
          setUser(parsed);
          setAuthTokenGetter(() => Promise.resolve(savedToken));
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Login failed");
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setAuthTokenGetter(() => Promise.resolve(data.token));
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const resp = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Registration failed");
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setAuthTokenGetter(() => Promise.resolve(data.token));
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setAuthTokenGetter(() => Promise.resolve(""));
  }, []);

  useEffect(() => {
    _onUnauthorized = () => {
      logout();
    };
    return () => { _onUnauthorized = null; };
  }, [logout]);

  const isAdmin = user?.role === "admin";
  const isEditor = user?.role === "editor";
  const canEditConfig = user?.role === "admin" || user?.role === "editor";
  const canManageUsers = user?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, isAdmin, isEditor, canEditConfig, canManageUsers }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
