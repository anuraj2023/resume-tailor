"""Authentication endpoints — register, login."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.auth import hash_password, verify_password, create_token

logger = logging.getLogger("resume_tailor.auth")

router = APIRouter(tags=["Auth"])


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    token: str
    username: str


@router.post("/api/auth/register", response_model=AuthResponse)
async def register(request: Request, body: RegisterRequest):
    """Create a new user account."""
    pool = request.app.state.pool
    hashed = hash_password(body.password)

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE username = $1", body.username
        )
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")

        row = await conn.fetchrow(
            "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
            body.username, hashed,
        )

    user_id = row["id"]
    token = create_token(user_id, body.username)
    logger.info("User registered: %s (id=%d)", body.username, user_id)
    return AuthResponse(token=token, username=body.username)


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(request: Request, body: LoginRequest):
    """Authenticate with username + password, receive JWT."""
    pool = request.app.state.pool

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE username = $1",
            body.username,
        )

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(row["id"], body.username)
    logger.info("User logged in: %s", body.username)
    return AuthResponse(token=token, username=body.username)
