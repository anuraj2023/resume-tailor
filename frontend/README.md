# Resume Tailor — Frontend

Next.js single-page app for uploading a LaTeX resume, pasting a job description, and viewing tailored results.

## Setup

### Prerequisites

- Node.js 20+

### Install

```bash
cd resume-tailor/frontend

npm install

# Configure API URL (optional — defaults to localhost:8001)
cp .env.example .env.local
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8001` | Backend API URL |

### Run

```bash
npm run dev
```

Open http://localhost:3000

> The backend must be running on port 8001 (or whatever `NEXT_PUBLIC_API_URL` points to).

### Verify

1. Open http://localhost:3000 — if auth is enabled (`AUTH_USERNAME` set on backend), you'll see a login form. Otherwise, you'll see the main layout directly.
2. The file upload zone should say "Drop .tex file here"
3. The submit button should be disabled (both file and JD are required)

## Input Constraints

The frontend enforces these constraints before submitting to the backend:

| Input | Constraint | What Happens |
|-------|-----------|--------------|
| Resume file | `.tex` extension only | File rejected with error message |
| Resume file | Max 2 MB | Rejected by backend (413) |
| JD text | Minimum 50 characters | Submit button stays disabled, character count shown |
| JD text | Silently truncated at 4,000 chars | Backend truncates — frontend doesn't enforce |
| Job title | Optional | Sent as empty string if not provided |
| Company name | Optional | Sent as empty string if not provided |
| Custom instructions | Optional | Passed to matcher LLM as `user_instructions` |

## Real-Time Pipeline Progress (SSE)

While the backend processes the request (first run ~30-60s, cached re-runs ~5s), the frontend shows **real-time** pipeline steps via Server-Sent Events:

```
Analyzing resume... → Extracting keywords... → Matching skills... →
Computing reorder plan... → Injecting into LaTeX... → Compiling PDF...
```

The frontend POSTs to `/api/tailor-stream` and consumes an SSE stream via `fetch()` + `ReadableStream` (not `EventSource`, which is GET-only). Each backend pipeline stage emits a `progress` event with `{step, label}`, and the final result arrives as a `complete` event. Errors during the pipeline emit an `error` event with `{detail, step}`.

The progress dot indicator in the UI advances in real time as each step actually completes on the backend. Cancellation is supported via `AbortController`.

See `PIPELINE_STEPS` in [page.tsx](src/app/page.tsx), `tailorResumeStream` in [api.ts](src/lib/api.ts), and the `aria-live="polite"` region for screen reader announcements.

## UI Layout

```
┌───────────────────────────────┬───────────────────────────────┐
│  Input Panel                  │  Results Panel                │
│                               │                               │
│  ┌─────────────────────────┐  │  ┌──────────┐                │
│  │  Drop .tex file here    │  │  │ Match: 80%│  (SVG ring)   │
│  └─────────────────────────┘  │  └──────────┘                │
│                               │                               │
│  ┌─────────────────────────┐  │  Matched:  Python  Django ... │
│  │                         │  │  Missing:  Go  Rust           │
│  │  Paste JD here...       │  │  Injectable:  REST APIs       │
│  │                         │  │                               │
│  └─────────────────────────┘  │  Skills Order: backend → ...  │
│                               │  Project Order: chat_app → ...│
│  Title: _______ Co: _______  │  Summary: "Backend Dev with..."│
│                               │                               │
│  ┌─────────────────────────┐  │  [▸ LaTeX Diff]               │
│  │ Custom instructions...  │  │  [Download PDF]               │
│  └─────────────────────────┘  │                               │
│                               │  ┌─────────────────────────┐  │
│  [ Tailor Resume ]            │  │ Refine instructions...   │  │
│                               │  └─────────────────────────┘  │
│                               │  [ Refine ]                   │
└───────────────────────────────┴───────────────────────────────┘
```

Both inputs (file + JD) are required before the submit button activates. After results appear, a refine input lets users iterate with new instructions — cached steps (0+1) are reused for ~5s turnaround.

## Tech Stack

- **Next.js 15** with App Router
- **React 19**
- **Tailwind CSS v4**
- **TypeScript 5.7**
- **Vitest** + **React Testing Library** for component tests
- **ESLint 9** with `next/core-web-vitals` + `next/typescript` (flat config)

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx            Root layout (Inter font, OG meta, favicon)
│   │   ├── page.tsx              Main page — auth gate + two-panel split
│   │   └── globals.css           Tailwind imports
│   │
│   ├── components/
│   │   ├── jd-input-panel.tsx    File upload + JD textarea + metadata + custom instructions (memo'd)
│   │   ├── password-gate.tsx     Login form (username + password, sessionStorage)
│   │   ├── results-panel.tsx     Composes all result sub-components + refine flow
│   │   ├── match-score.tsx       SVG circular progress ring (accessible)
│   │   ├── keyword-chips.tsx     Matched/missing/injectable chips (semantic <ul>/<li>)
│   │   ├── reorder-info.tsx      Skills order, project order, summary preview
│   │   ├── diff-view.tsx         Collapsible unified diff viewer (memoized)
│   │   ├── download-button.tsx   PDF / LaTeX / ZIP download
│   │   ├── error-boundary.tsx    React error boundary with retry
│   │   └── __tests__/            Component tests (vitest + testing-library)
│   │       ├── match-score.test.tsx
│   │       ├── keyword-chips.test.tsx
│   │       ├── diff-view.test.tsx
│   │       ├── error-boundary.test.tsx
│   │       └── reorder-info.test.tsx
│   │
│   ├── __tests__/
│   │   └── setup.ts              Vitest setup (jest-dom matchers, cleanup)
│   │
│   └── lib/
│       ├── api.ts                API client (FormData, timeout, abort handling)
│       ├── types.ts              TypeScript interfaces (mirrors backend schemas)
│       └── utils.ts              cn(), formatDuration(), category labels
│
├── .env.example
├── .env.local                    (gitignored)
├── .gitignore
├── public/
│   └── favicon.svg               Blue document icon
├── eslint.config.mjs             ESLint 9 flat config (next + typescript rules)
├── vitest.config.ts              Vitest config (jsdom, path aliases)
├── package.json
├── tsconfig.json
├── next.config.ts
└── postcss.config.mjs
```

## Components

### `password-gate.tsx`

Full-screen login form shown when auth is enabled on the backend (`AUTH_USERNAME` + `AUTH_PASSWORD` set):
- **Username + password inputs** with "Sign In" button
- Calls `POST /api/auth/verify` with `X-Auth-Username` + `X-Auth-Password` headers
- On success: stores credentials in `sessionStorage` (`auth_username`, `auth_password`)
- If `auth_enabled: false` from the verify response: auto-proceeds without showing the form
- Shows "Invalid username or password" or "Cannot reach server" errors

After signing in, a **Sign out** link appears in the header. Clicking it clears `sessionStorage` and returns to the login form. Credentials are automatically cleared when the browser tab is closed (sessionStorage behavior).

### `jd-input-panel.tsx`

Input panel with:
- **File upload zone**: Drag-and-drop or click. Accepts `.tex` only. Shows filename + remove button when selected.
- **JD textarea**: 50-character minimum. Character count shown.
- **Job title / Company**: Optional metadata fields.
- **Custom instructions** (optional): Textarea for user-provided tailoring instructions (e.g., "Add Docker to skills, emphasize backend experience"). Passed to the matcher LLM as `user_instructions`.
- **Submit button**: Disabled until both file AND JD are provided. Shows spinner during loading.
- **Tip**: "Don't have a .tex? Ask ChatGPT/Claude to convert your resume, or use Mathpix."

### `match-score.tsx`

SVG circular progress ring with percentage. Color-coded:
- Green: score >= 70%
- Yellow: score >= 40%
- Red: score < 40%

Accessible: `role="figure"` with `aria-label` describing the score, SVG marked `aria-hidden`.

### `keyword-chips.tsx`

Three groups of keyword chips with category headers:
- **Matched** (green): Skills the candidate has that match the JD
- **Missing** (red): Skills the JD requires that the candidate doesn't have
- **Injectable** (blue): Skills the candidate has but aren't on the current resume — will be added

Uses semantic HTML (`<ul>/<li>` for chip lists, `role="group"` with `aria-label` for sections).

### `reorder-info.tsx`

Displays the reorder plan:
- Skills category order (e.g., "backend → devops → languages → ...")
- Project order (most relevant first)
- Generated summary first line preview

### `diff-view.tsx`

Collapsible unified diff viewer showing LaTeX changes:
- Green lines: additions
- Red lines: deletions
- Blue lines: diff headers

Line parsing and change count are memoized with `useMemo` to avoid recalculation on toggle.

### `download-button.tsx`

Three download options:
- **PDF**: Base64-decoded PDF download (using `Uint8Array.from()`)
- **LaTeX**: Raw `.tex` source file
- **ZIP**: Combined PDF + LaTeX via JSZip

Displays an amber warning banner when `pdf_error` is set (PDF compilation failed but other results are available).

### `results-panel.tsx` — Refine Flow

After initial results are displayed, a refine input appears at the bottom of the results panel:
- **Text input**: For refinement instructions (e.g., "Move Python higher, add Kubernetes to skills")
- **Refine button**: Re-submits the same form data through `/api/tailor-stream` with `user_instructions` set to the refinement text
- **UX**: Current results stay visible during refinement (no flash of empty state). New results replace old ones when ready.

Since Steps 0 (resume analysis) and 1 (JD extraction) are cached, refinement runs take ~5s instead of ~30s.

## API Client

`lib/api.ts` provides two API functions:

**`tailorResumeStream()`** (primary) — POSTs FormData to `/api/tailor-stream`, consumes SSE events via `ReadableStream`:
- `onStep` callback: fired for each `progress` event (step index + label)
- `onComplete` callback: fired for `complete` event (full `TailorResponse`)
- `onError` callback: fired for `error` event or network/timeout failures

**`tailorResume()`** (legacy) — POSTs FormData to `/api/tailor`, returns the full JSON response at once.

Both share the same features:
- **Auth headers**: `X-Auth-Username` + `X-Auth-Password` from `sessionStorage` (via `getAuthHeaders()`)
- **Timeout**: 2-minute timeout with deterministic detection (flag set before abort)
- **Abort**: Caller can pass an `AbortSignal` for cancellation (forwarded to internal controller)
- **Error handling**: Distinguishes timeout vs user cancellation vs network errors vs API errors
- **Custom instructions**: Appends `user_instructions` to FormData when provided

## Testing

```bash
npm test            # run all tests once
npm run test:watch  # watch mode
```

39 tests across 6 files using **Vitest** + **React Testing Library** + **@testing-library/user-event** + **jsdom**:

| Test File | What | Tests |
|-----------|------|-------|
| `utils.test.ts` | `cn()` class merging, `formatDuration()`, `CATEGORY_LABELS` | 10 |
| `match-score.test.tsx` | Score rendering, color thresholds (green/yellow/red), `aria-label`, SVG hidden | 7 |
| `keyword-chips.test.tsx` | Chip rendering, `role="group"`, category labels, empty state, skip empty cats | 6 |
| `diff-view.test.tsx` | Empty diff, change count, expand/collapse, `aria-expanded`, line coloring | 7 |
| `error-boundary.test.tsx` | Children rendering, fallback UI on throw, Try Again button, recovery | 4 |
| `reorder-info.test.tsx` | Skills/project order labels, summary truncation, section heading | 5 |

## Build

```bash
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint (flat config, next + typescript)
npm test         # Vitest (39 tests)
```

## ESLint

Flat config (`eslint.config.mjs`) extends `next/core-web-vitals` and `next/typescript` with:

- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `@typescript-eslint/no-unused-vars`: warn (ignores `_` prefixed args/vars)
- `@typescript-eslint/no-explicit-any`: warn

## Performance

- **`React.memo`** on `JdInputPanel` prevents re-renders when only `loading`/`step` state changes in the parent
- **`useCallback`** on `handleTailor` and `handleCancel` stabilizes callback references
- **`useMemo`** in `DiffView` avoids re-splitting/re-filtering diff lines on toggle

## Accessibility

- `aria-live="polite"` on pipeline step text for screen reader announcements
- `aria-expanded` on collapsible diff toggle
- `role="alert"` on file upload errors
- `role="figure"` with descriptive `aria-label` on match score
- `aria-hidden="true"` on decorative SVGs and progress dots
- Keyboard-accessible file upload zone (`Enter`/`Space` to open file picker)

## Adding a New Component

1. Create the component in `src/components/`:
   ```tsx
   // src/components/my-component.tsx
   "use client";

   interface MyComponentProps {
     data: string;
   }

   export function MyComponent({ data }: MyComponentProps) {
     return <div>{data}</div>;
   }
   ```

2. Add types to `src/lib/types.ts` if the component uses backend response data.

3. Import it in `results-panel.tsx` (for result display components) or `page.tsx` (for top-level components).

4. Create a test file in `src/components/__tests__/`:
   ```tsx
   // src/components/__tests__/my-component.test.tsx
   import { describe, it, expect } from "vitest";
   import { render, screen } from "@testing-library/react";
   import { MyComponent } from "../my-component";

   describe("MyComponent", () => {
     it("renders data", () => {
       render(<MyComponent data="hello" />);
       expect(screen.getByText("hello")).toBeInTheDocument();
     });
   });
   ```

5. Run tests: `npm test`

**Conventions:**
- Use `"use client"` directive for components with state or event handlers
- Use `React.memo` for components that receive frequently-changing parent props but don't need to re-render
- Add `aria-label`, `role`, and `aria-expanded` where appropriate (see Accessibility section)
- Use Tailwind classes — no CSS modules or styled-components
