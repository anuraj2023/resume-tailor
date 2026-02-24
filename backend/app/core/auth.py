"""Authentication utilities — bcrypt hashing + JWT tokens."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import load_settings

JWT_ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, username: str) -> str:
    """Create a JWT token for the given user."""
    settings = load_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises jwt.PyJWTError on failure."""
    settings = load_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    payload["sub"] = int(payload["sub"])
    return payload
