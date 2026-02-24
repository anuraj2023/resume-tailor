"""Health check + auth verify endpoints."""

import time

from fastapi import APIRouter, Request

from app.config import load_settings

router = APIRouter(tags=["System"])

_start_time = time.monotonic()


@router.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "resume-tailor",
        "version": "1.0.0",
        "uptime_seconds": round(time.monotonic() - _start_time),
    }


@router.post("/api/auth/verify")
async def verify_auth(request: Request):
    """Check if provided credentials are valid.

    JWT mode: validates Authorization: Bearer <token>.
    Env mode: validates X-Auth-Username / X-Auth-Password headers.
    Returns {"valid": bool, "auth_enabled": bool, "mode": "jwt"|"env"|"none"}.
    """
    settings = load_settings()

    # JWT mode — database_url is set
    if settings.jwt_secret:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return {"valid": False, "auth_enabled": True, "mode": "jwt"}
        try:
            from app.core.auth import decode_token
            decode_token(auth_header[7:])
            return {"valid": True, "auth_enabled": True, "mode": "jwt"}
        except Exception:
            return {"valid": False, "auth_enabled": True, "mode": "jwt"}

    # Env mode — fallback to header-based auth
    if not settings.auth_username:
        return {"valid": True, "auth_enabled": False, "mode": "none"}

    req_user = request.headers.get("x-auth-username", "")
    req_pass = request.headers.get("x-auth-password", "")
    valid = req_user == settings.auth_username and req_pass == settings.auth_password
    return {"valid": valid, "auth_enabled": True, "mode": "env"}
