import { useState, useEffect, createContext, useContext } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface User {
  id: number;
  username: string;
  role: "admin" | "editor" | "viewer";
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
  });

  useEffect(() => {
    // Keep API requests aligned with the current browser session. Reading
    // localStorage on each request avoids retaining a token from a previous
    // login/session after a reload or server-side secret rotation.
    setAuthTokenGetter(() => localStorage.getItem("sentinel_token"));

    // Initialize from localStorage
    const storedToken = localStorage.getItem("sentinel_token");
    const storedUser = localStorage.getItem("sentinel_user");

    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setState({ user, token: storedToken, isLoading: false });
        
      } catch (e) {
        localStorage.removeItem("sentinel_token");
        localStorage.removeItem("sentinel_user");
        setState({ user: null, token: null, isLoading: false });
      }
    } else {
      setState({ user: null, token: null, isLoading: false });
    }

    return () => {
      setAuthTokenGetter(null);
    };
  }, []);

  const login = (token: string, user: User) => {
    localStorage.setItem("sentinel_token", token);
    localStorage.setItem("sentinel_user", JSON.stringify(user));
    setAuthTokenGetter(() => token);
    setState({ user, token, isLoading: false });
    setLocation("/");
  };

  const logout = () => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_user");
    setAuthTokenGetter(() => null);
    setState({ user: null, token: null, isLoading: false });
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
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
