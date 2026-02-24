"""Middleware — request ID + JWT auth gate.

Uses pure ASGI middleware (not BaseHTTPMiddleware) to avoid buffering
StreamingResponse, which is needed for the SSE endpoint.
"""

import json
import logging
import uuid
from contextvars import ContextVar

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("resume_tailor.middleware")

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdMiddleware:
    """Attach an 8-char request ID to every request/response cycle."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        rid = uuid.uuid4().hex[:8]
        request_id_var.set(rid)
        scope.setdefault("state", {})["request_id"] = rid

        async def send_with_rid(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.append("X-Request-ID", rid)
            await send(message)

        await self.app(scope, receive, send_with_rid)


class JWTAuthMiddleware:
    """Block /api/tailor* requests that lack a valid JWT.

    When jwt_secret is set, expects Authorization: Bearer <token>.
    When jwt_secret is empty, falls back to X-Auth-Username/Password headers.
    Health check, auth, and non-API paths are always unprotected.
    """

    def __init__(
        self, app: ASGIApp, jwt_secret: str,
        username: str = "", password: str = "",
    ) -> None:
        self.app = app
        self.jwt_secret = jwt_secret
        self.username = username
        self.password = password

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Skip auth for non-protected paths
        if not path.startswith("/api/tailor"):
            await self.app(scope, receive, send)
            return

        # No auth configured at all — pass through
        if not self.jwt_secret and not self.username:
            await self.app(scope, receive, send)
            return

        headers_list = scope.get("headers", [])
        headers = {k: v for k, v in headers_list}

        # JWT mode
        if self.jwt_secret:
            auth_header = headers.get(b"authorization", b"").decode()
            if not auth_header.startswith("Bearer "):
                await self._send_401(send, "Missing or invalid Authorization header")
                return

            token = auth_header[7:]
            try:
                from app.core.auth import decode_token
                payload = decode_token(token)
                scope.setdefault("state", {})["user_id"] = payload["sub"]
                scope["state"]["username"] = payload["username"]
            except Exception:
                await self._send_401(send, "Invalid or expired token")
                return

            await self.app(scope, receive, send)
            return

        # Fallback: env-based password check
        req_user = headers.get(b"x-auth-username", b"").decode()
        req_pass = headers.get(b"x-auth-password", b"").decode()

        if req_user != self.username or req_pass != self.password:
            await self._send_401(send, "Invalid credentials")
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _send_401(send: Send, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode()
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({"type": "http.response.body", "body": body})
