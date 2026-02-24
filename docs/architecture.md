# Architecture

## System Overview

Resume Tailor is a two-service application: a **Python FastAPI backend** (port 8001) that orchestrates a 6-step LLM pipeline, and a **Next.js 15 frontend** (port 3001) that provides the upload/results UI.

```
┌──────────────────┐     ┌──────────────────┐
│   Next.js 15      │     │   FastAPI          │
│   React 19        │────→│   Python 3.12      │
│   Tailwind v4     │     │   uvicorn          │
│   (port 3001)     │←────│   (port 8001)      │
└──────────────────┘     └────────┬───────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
              ┌──────────┐ ┌──────────┐  ┌──────────┐
              │ OpenAI    │ │ Gemini    │  │ Langfuse  │
              │ GPT-4o-   │ │ 2.0-flash │  │ (prompts  │
              │ mini      │ │ (fallback)│  │  + traces) │
              └──────────┘ └──────────┘  └──────────┘
                                  │
                                  ▼
                           ┌──────────┐
                           │PostgreSQL │
                           │(Neon)     │
                           │users table│
                           └──────────┘
```

**Key design decisions:**

1. **Backend-driven pipeline** — All LLM calls, LaTeX manipulation, and PDF compilation happen server-side. The frontend is a thin UI layer.
2. **Prompt externalization** — LLM prompts live in Langfuse, not in code. Prompts can be edited without redeployment. Embedded fallback prompts provide resilience.
3. **Marker-based LaTeX** — Step 0 inserts comment markers (`% SKILLS_START`, `% EXP:company`) into uploaded `.tex` files. All subsequent steps use these markers for surgical modifications without touching unrelated content.

---

## Request Lifecycle

Both `POST /api/tailor` (JSON) and `POST /api/tailor-stream` (SSE) share the same pipeline. The stream variant emits `progress` events as each step completes. Here's the request lifecycle:

```
Client (multipart: .tex file + JD text + metadata)
  │
  ▼
┌─ RequestIdMiddleware ─────────────────────────────────────┐
│  Generate 8-char UUID → store in contextvars + request    │
│  state → attach X-Request-ID to response header           │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌─ CORS Middleware ─────────────────────────────────────────┐
│  Validate origin, set Access-Control-* headers            │
│  expose_headers: ["X-Request-ID"]                         │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌─ JWTAuthMiddleware (pure ASGI) ──────────────────────────┐
│  Protects /api/tailor* only (skips health, auth, static)  │
│  JWT mode: decode Bearer token → set user_id in state     │
│  Env mode: check X-Auth-Username/Password headers         │
│  Returns 401 JSON on invalid/missing credentials          │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌─ Rate Limiter (slowapi) ──────────────────────────────────┐
│  10 req/min per IP (configurable via RATE_LIMIT_PER_MIN)  │
└─────────────┬─────────────────────────────────────────────┘
              │
              ▼
┌─ Route: POST /api/tailor or /api/tailor-stream ───────────┐
│                                                            │
│  1. Validate upload (size, extension, content)             │
│  2. Read .tex content from uploaded file                   │
│                                                            │
│  ┌──── asyncio.gather (parallel) ────┐                     │
│  │  Step 0: Analyze .tex (LLM)       │                     │
│  │  Step 1: Extract JD keywords (LLM)│                     │
│  └────────────┬──────────────────────┘                     │
│               ▼                                            │
│  Step 2: Match keywords vs skills (LLM)                    │
│               ▼                                            │
│  Step 3: Compute reorder plan (deterministic)              │
│               ▼                                            │
│  Step 4: Apply changes to LaTeX (deterministic)            │
│               ▼                                            │
│  Step 5: Compile PDF via pdflatex (subprocess)             │
│               ▼                                            │
│  /api/tailor: Return full JSON response                     │
│  /api/tailor-stream: Emit SSE complete event                │
└────────────────────────────────────────────────────────────┘
              │
              ▼
┌─ Global Exception Handlers ───────────────────────────────┐
│  HTTPException → {detail, request_id}                      │
│  Unhandled    → log traceback, return 500 + request_id     │
└───────────────────────────────────────────────────────────┘
```

---

## Module Map

### Backend (`backend/app/`)

| Module | File | Responsibility |
|--------|------|----------------|
| **Entry point** | `main.py` | FastAPI app, lifespan (DB pool), middleware stack, exception handlers, static mount |
| **Middleware** | `middleware.py` | Pure ASGI middleware — `RequestIdMiddleware` (8-char UUID) + `JWTAuthMiddleware` (JWT/env-auth for `/api/tailor*`) |
| **Config** | `config.py` | Pydantic `BaseSettings` singleton, loads from `.env` |
| **Auth** | `core/auth.py` | bcrypt password hashing (`hash_password`, `verify_password`) + JWT token creation/verification (`create_token`, `decode_token`) |
| **Database** | `core/database.py` | asyncpg connection pool management (`create_pool`, `close_pool`) + `ensure_users_table` auto-migration |
| **Constants** | `core/constants.py` | All magic numbers: upload limits, truncation lengths, timeouts |
| **Logger** | `core/logger.py` | Structured JSON + colored console formatters with request_id |
| **LLM Client** | `core/llm.py` | OpenAI primary + Gemini fallback, Langfuse-traced |
| **Langfuse** | `core/langfuse_client.py` | Prompt fetching with 300s cache, `@observe` decorator |
| **Fallback Prompts** | `core/fallback_prompts.py` | Embedded prompt copies for Langfuse-down scenarios |
| **Models** | `models.py` | Pydantic schemas: `ExtractedKeywords`, `MatchResult`, `ResumeAnalysis`, `ReorderPlan` |
| **Route: Health** | `routes/health.py` | `GET /api/health` — status, version, uptime. `POST /api/auth/verify` — auth mode detection + token validation |
| **Route: Auth** | `routes/auth.py` | `POST /api/auth/register` + `POST /api/auth/login` — user registration and login with JWT (only available when `DATABASE_URL` is set) |
| **Route: Tailor** | `routes/tailor.py` | `POST /api/tailor` (JSON) + `POST /api/tailor-stream` (SSE) — shared 6-step pipeline |
| **Step 0** | `services/resume_analyzer.py` | LLM: insert markers + extract skills from .tex |
| **Step 1** | `services/extractor.py` | LLM: parse JD into structured keyword categories |
| **Step 2** | `services/matcher.py` | LLM: semantic matching of JD keywords vs resume skills |
| **Step 3** | `services/reorderer.py` | Deterministic: compute reorder plan from match results |
| **Step 4** | `services/injector.py` | Deterministic: apply reorder + inject keywords into LaTeX |
| **Step 5** | `services/compiler.py` | Subprocess: pdflatex compilation with timeout |
| **LaTeX Parser** | `latex/parser.py` | Parse .tex by comment markers into sections |
| **LaTeX Writer** | `latex/writer.py` | Write modified sections back to .tex |

### Frontend (`frontend/src/`)

| Module | File | Responsibility |
|--------|------|----------------|
| **Layout** | `app/layout.tsx` | Dark theme, Inter font, metadata |
| **Page** | `app/page.tsx` | Two-panel layout: input | results |
| **JD Input** | `components/jd-input-panel.tsx` | File upload + JD textarea + job metadata |
| **Results** | `components/results-panel.tsx` | Composes all result sub-components |
| **Match Score** | `components/match-score.tsx` | SVG circular progress ring (accessible) |
| **Keywords** | `components/keyword-chips.tsx` | Matched/missing/injectable chips |
| **Reorder Info** | `components/reorder-info.tsx` | Skills order, project order, tailored summary |
| **Diff View** | `components/diff-view.tsx` | Collapsible LaTeX diff viewer (memoized) |
| **Download** | `components/download-button.tsx` | PDF / LaTeX / ZIP download |
| **Error Boundary** | `components/error-boundary.tsx` | React error boundary |
| **API Client** | `lib/api.ts` | SSE stream consumer (`tailorResumeStream`), legacy JSON client (`tailorResume`), auth functions (`authRegister`, `authLogin`), JWT/env-auth header injection, timeout, abort |
| **Types** | `lib/types.ts` | TypeScript interfaces matching backend schemas |
| **Utilities** | `lib/utils.ts` | `cn()`, `formatDuration()`, category labels |

---

## Data Flow: What Changes Per JD

| Element | How It Changes | Implementation |
|---------|---------------|----------------|
| Skills category order | Reordered by JD match count | `reorderer.py` sorts by `matched[category]` count |
| Skills injection | Matched keywords not on resume are added | `injector.py` appends to `\skillline{}{}` |
| Project order | Reordered by keyword overlap with JD | `reorderer.py` scores each project's tech stack |
| Summary first line | Generated from role title + top matched skills | `reorderer.py` builds from `ExtractedKeywords.role_title` |
| Experience emphasis | Highlight relevant keywords per entry | `reorderer.py` identifies which keywords appear in each entry |

**What never changes:** Experience bullets, company names, dates, achievements, project descriptions, LaTeX layout/formatting.
