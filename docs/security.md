# Security

## Overview

Security is implemented at multiple layers: **authentication** (JWT + bcrypt), **input validation** at the API boundary, **CORS + rate limiting** at the middleware layer, **security headers** on the frontend, and **Docker hardening** for deployment.

---

## Authentication

The API supports two auth modes, selected automatically based on configuration:

### JWT Mode (Database-backed)

**Activated when:** `DATABASE_URL` and `JWT_SECRET` are set in `.env`

**Files:** `backend/app/core/auth.py`, `backend/app/core/database.py`, `backend/app/routes/auth.py`, `backend/app/middleware.py`

User accounts are stored in the `users` table in PostgreSQL (Neon). Passwords are hashed with **bcrypt** and sessions use **JWT tokens** (HS256).

**Database schema:**
```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Endpoints (public — no auth required):**

| Method | Endpoint | Request Body | Response |
|--------|----------|-------------|----------|
| `POST` | `/api/auth/register` | `{"username": "...", "password": "..."}` | `{"token": "jwt...", "username": "..."}` |
| `POST` | `/api/auth/login` | `{"username": "...", "password": "..."}` | `{"token": "jwt...", "username": "..."}` |
| `POST` | `/api/auth/verify` | — (reads `Authorization` header) | `{"valid": bool, "auth_enabled": true, "mode": "jwt"}` |

**Validation:** Register requires username 3-100 chars, password 8-128 chars.

**Auth flow:**
```
Register:  password → bcrypt.hashpw() → stored in users table → JWT returned
Login:     password → bcrypt.checkpw() against stored hash → JWT returned
Token:     jwt.encode({sub: user_id, username, iat, exp}, JWT_SECRET, HS256)
```

**Middleware:** `JWTAuthMiddleware` (pure ASGI — not `BaseHTTPMiddleware`) protects `/api/tailor*` endpoints. Extracts `Authorization: Bearer <token>`, decodes JWT, sets `user_id` and `username` in request state. Returns 401 on invalid/missing token.

**Frontend:** The login/register form auto-detects JWT mode via `/api/auth/verify`. On success, stores `auth_token` in `localStorage`. All API requests include `Authorization: Bearer <token>`.

### Env Mode (Legacy fallback)

**Activated when:** `DATABASE_URL` is empty, `AUTH_USERNAME` is set

Single shared username/password configured in `.env`. The middleware checks `X-Auth-Username` and `X-Auth-Password` headers against the env values. Frontend stores credentials in `sessionStorage`.

### No Auth

**Activated when:** Both `DATABASE_URL` and `AUTH_USERNAME` are empty

All requests pass through without authentication. Suitable for local development.

### Configuration

```bash
# JWT mode (recommended):
DATABASE_URL=postgresql://user:pass@host/resume_tailor?sslmode=require
JWT_SECRET=your-64-char-random-secret
JWT_EXPIRY_HOURS=24

# Env mode (legacy fallback):
AUTH_USERNAME=your-username
AUTH_PASSWORD=your-password
```

---

## Input Validation

**File:** `backend/app/routes/tailor.py`, `backend/app/core/constants.py`

All user input is validated before reaching the pipeline:

| Check | Constant | Value | Rejection |
|-------|----------|-------|-----------|
| File size | `MAX_UPLOAD_SIZE` | 2 MB | 413: File too large |
| File extension | — | `.tex` only | 400: Invalid file type |
| Content-Type | — | `application/x-tex`, `text/x-tex`, `text/plain`, `application/octet-stream`, `application/x-latex` | 400: Invalid file type |
| File content minimum | `MIN_TEX_SIZE` | 100 chars | 400: File too small |
| JD text minimum | `MIN_JD_LENGTH` | 50 chars | 400: JD too short |
| JD text truncation | `JD_TRUNCATE_LENGTH` | 4,000 chars | Silently truncated |
| TeX content truncation | `TEX_TRUNCATE_LENGTH` | 15,000 chars | Silently truncated |

**Why truncate?** LLM context windows are expensive. Sending 50KB of LaTeX wastes tokens on preamble/formatting. Truncation ensures only the relevant content reaches the LLM while keeping costs predictable.

All constants are centralized in `core/constants.py` — no magic numbers in service code.

---

## CORS

**File:** `backend/app/main.py`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,     # from .env: "http://localhost:3000,http://localhost:3001"
    allow_methods=["GET", "POST"],      # only methods the API uses
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],    # let frontend read request IDs
)
```

**Key decisions:**

- **Origins are configurable** via `ALLOWED_ORIGINS` in `.env` — not hardcoded
- **Methods are restricted** to GET and POST — the API has no PUT/DELETE/PATCH endpoints
- **Headers are explicit** — only `Content-Type`, `Authorization`, and `X-Request-ID` are allowed (no wildcard `*`)
- **`expose_headers`** is required for the frontend to read the `X-Request-ID` response header (browsers block custom headers by default under CORS)

---

## Rate Limiting

**File:** `backend/app/main.py`, `backend/app/routes/tailor.py`

Rate limiting uses [slowapi](https://github.com/laurentS/slowapi) (a FastAPI wrapper around `limits`):

```python
limiter = Limiter(key_func=get_remote_address)    # per-IP
app.state.limiter = limiter

# On the tailor route:
@router.post("/api/tailor")
@limiter.limit(f"{RATE_LIMIT_PER_MINUTE}/minute")
async def tailor_resume(request: Request, ...):
```

| Setting | Value | Why |
|---------|-------|-----|
| Rate | 10 req/min per IP | Each request makes 3 LLM calls — 10/min prevents abuse while allowing normal usage |
| Key function | `get_remote_address` | Per-IP limiting (use `X-Forwarded-For` behind a reverse proxy) |
| Exceeded response | 429 Too Many Requests | Standard HTTP status with Retry-After header |

Rate limiting is disabled in tests via a `conftest.py` fixture to avoid flaky tests.

---

## Frontend Security Headers

**File:** `frontend/next.config.ts`

The Next.js config returns security headers on all routes:

```typescript
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ],
  }];
}
```

| Header | What It Prevents |
|--------|-----------------|
| `X-Frame-Options: DENY` | Clickjacking — prevents the site from being embedded in iframes |
| `X-Content-Type-Options: nosniff` | MIME-sniffing attacks — browser must respect Content-Type |
| `Referrer-Policy: strict-origin-when-cross-origin` | Leaking full URLs in Referer header to third parties |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | Blocks browser APIs the app doesn't need |
| `X-DNS-Prefetch-Control: on` | Performance: pre-resolve DNS for linked resources |

---

## Docker Hardening

**File:** `backend/Dockerfile`

### Non-Root User

```dockerfile
RUN useradd --create-home appuser
# ... install deps, copy code ...
USER appuser
```

**Why:** If the container is compromised, the attacker runs as `appuser` (no privileges) instead of `root`. This is a defense-in-depth measure recommended by CIS Docker Benchmark.

### Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')"
```

Docker uses this to determine if the container is healthy. Orchestrators (Docker Compose, ECS, Kubernetes) can restart unhealthy containers automatically.

### .dockerignore

**File:** `backend/.dockerignore`

```
.env
.env.*
.git
tests/
output/
__pycache__
.pytest_cache
*.pyc
scripts/
README.md
requirements-dev.txt
```

**Why:** Keeps the Docker build context small and prevents secrets (`.env`) and development artifacts from leaking into the production image.

---

## Secrets Management

**File:** `backend/app/config.py`

Secrets are loaded from environment variables via Pydantic `BaseSettings`:

```python
class Settings(BaseSettings):
    openai_api_key: str = ""
    google_ai_api_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    auth_username: str = ""        # legacy env-auth
    auth_password: str = ""        # legacy env-auth
    database_url: str = ""         # PostgreSQL (enables JWT mode)
    jwt_secret: str = ""           # JWT signing key
    jwt_expiry_hours: int = 24     # token lifetime
    # ... other settings
```

- **Local development:** `.env` file (gitignored)
- **Production:** Set via deployment platform environment variables (Render, Railway, etc.)
- **Docker:** Pass via `docker run -e` or Docker Compose `environment` section

The `.env` file is excluded from both `.gitignore` and `.dockerignore`.
