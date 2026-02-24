import { TailorRequest, TailorResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  // JWT mode (preferred)
  const token = localStorage.getItem("auth_token");
  if (token) return { Authorization: `Bearer ${token}` };
  // Fallback: env-based auth
  const username = sessionStorage.getItem("auth_username") || "";
  const password = sessionStorage.getItem("auth_password") || "";
  if (!username) return {};
  return { "X-Auth-Username": username, "X-Auth-Password": password };
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function authRegister(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || `Error: ${response.status}`);
  }
  return response.json();
}

export async function authLogin(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || `Error: ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// SSE Types
// ---------------------------------------------------------------------------

export interface SSEProgressEvent {
  step: number;
  label: string;
}

export interface SSEErrorEvent {
  detail: string;
  step: number;
}

export interface StreamCallbacks {
  onStep: (event: SSEProgressEvent) => void;
  onComplete: (result: TailorResponse) => void;
  onError: (error: SSEErrorEvent | Error) => void;
}

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

function parseSSEEvent(raw: string): { event: string | null; data: unknown } {
  let event: string | null = null;
  let dataStr = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr += line.slice(6);
    }
  }

  try {
    return { event, data: dataStr ? JSON.parse(dataStr) : null };
  } catch {
    return { event: null, data: null };
  }
}

async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const { event, data } = parseSSEEvent(part);
        if (!event || !data) continue;

        switch (event) {
          case "progress":
            callbacks.onStep(data as SSEProgressEvent);
            break;
          case "complete":
            callbacks.onComplete(data as TailorResponse);
            break;
          case "error":
            callbacks.onError(data as SSEErrorEvent);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// SSE Streaming API
// ---------------------------------------------------------------------------

export async function tailorResumeStream(
  request: TailorRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData();
  formData.append("jd_text", request.jd_text);
  formData.append("resume_file", request.resume_file);
  if (request.job_title) formData.append("job_title", request.job_title);
  if (request.company_name) formData.append("company_name", request.company_name);
  if (request.user_instructions) formData.append("user_instructions", request.user_instructions);

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${API_BASE}/api/tailor-stream`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
      signal: controller.signal,
    });

    // Validation errors come as normal HTTP errors (before stream opens)
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Response body is not readable");
    }

    await consumeSSEStream(response.body, callbacks);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (timedOut) {
        callbacks.onError(new Error("Request timed out — the server took too long to respond"));
      }
      // User cancel — don't report error
      return;
    }
    if (err instanceof TypeError) {
      callbacks.onError(new Error("Cannot reach the server — is the backend running?"));
      return;
    }
    if (err instanceof Error) {
      callbacks.onError(err);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Original JSON API (kept for backward compatibility / pipeline integration)
// ---------------------------------------------------------------------------

export async function tailorResume(
  request: TailorRequest,
  signal?: AbortSignal,
): Promise<TailorResponse> {
  const formData = new FormData();
  formData.append("jd_text", request.jd_text);
  formData.append("resume_file", request.resume_file);
  if (request.job_title) formData.append("job_title", request.job_title);
  if (request.company_name) formData.append("company_name", request.company_name);
  if (request.user_instructions) formData.append("user_instructions", request.user_instructions);

  // Create a combined abort controller for timeout + caller cancellation
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  // Forward caller's abort signal to our controller
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${API_BASE}/api/tailor`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (timedOut) {
        throw new Error("Request timed out — the server took too long to respond");
      }
      throw new Error("Request was cancelled");
    }
    if (err instanceof TypeError) {
      throw new Error("Cannot reach the server — is the backend running?");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
