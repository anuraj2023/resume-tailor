"use client";

import { useEffect, useState } from "react";
import { authLogin, authRegister } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

type AuthMode = "jwt" | "env" | "none" | null; // null = still detecting

interface PasswordGateProps {
  onAuthenticated: () => void;
}

export function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Detect auth mode on mount
  useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, { method: "POST" });
        const data = await res.json();
        if (!data.auth_enabled) {
          onAuthenticated();
          return;
        }
        setAuthMode(data.mode || "env");
      } catch {
        setAuthMode("env"); // fallback
      }
    };
    detect();
  }, [onAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "jwt") {
        // JWT mode — register or login via API
        const result = isRegister
          ? await authRegister(username, password)
          : await authLogin(username, password);
        localStorage.setItem("auth_token", result.token);
        localStorage.setItem("auth_username", result.username);
        onAuthenticated();
      } else {
        // Env mode — verify via headers
        const response = await fetch(`${API_BASE}/api/auth/verify`, {
          method: "POST",
          headers: {
            "X-Auth-Username": username,
            "X-Auth-Password": password,
          },
        });

        if (!response.ok) {
          setError("Server error — try again");
          return;
        }

        const data = await response.json();
        if (data.valid) {
          sessionStorage.setItem("auth_username", username);
          sessionStorage.setItem("auth_password", password);
          onAuthenticated();
        } else {
          setError("Invalid username or password");
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Cannot reach the server — is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  };

  // Still detecting mode
  if (authMode === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">Resume Tailor</span>
          </div>

          {/* Tab toggle — only in JWT mode */}
          {authMode === "jwt" && (
            <div className="flex mb-5 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => { setIsRegister(false); setError(""); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  !isRegister ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsRegister(true); setError(""); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isRegister ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                Register
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password{isRegister && <span className="text-gray-400 font-normal"> (min 8 characters)</span>}
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 8 : undefined}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? (isRegister ? "Creating account..." : "Signing in...")
                : (isRegister ? "Create Account" : "Sign In")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
