# BrainJam / GraspIt — Compact Context

> **Purpose:** Read this file after a context compaction to restore full project context without re-reading history. Keep it updated after every session.

---

## What is GraspIt?

A lecture-to-study-materials web app built for a hackathon (deadline: **March 27, 2026 — midday presentation**). Students record or upload lecture audio, snap whiteboard photos, or attach context files (PDFs, slides). The app generates flashcards, notes, title, summary, and topic tags. Users organise saved lectures into courses, study by topic, and take AI-generated exams.

**App name:** GraspIt (renamed from BrainJam — `<title>` and branding updated)
**Upstream repo:** https://github.com/Enrikkk/BrainJam (private)
**Deployment repo:** https://github.com/Boisset-C/BrainJam (fork — Netlify + Railway deploy from here)
**Live URL:** https://graspit.netlify.app

---

## Deployment Architecture

| Service | Platform | URL |
|---|---|---|
| Frontend (React/Vite) | Netlify | https://graspit.netlify.app |
| Backend (Django) | Railway | https://brainjam-production.up.railway.app |

**How they connect:** `frontend/.env.production` sets `VITE_API_URL=https://brainjam-production.up.railway.app` so the built frontend calls Railway directly (bypasses Netlify proxy which strips auth headers and has 10MB limit).

**`/api/process/` in `index.tsx` uses `` `${API_BASE}/api/process/` `` — must keep this or requests revert to Netlify proxy.**

**Railway config:**
- Root directory: `backend`
- Start command defined in `backend/railway.toml`: `cd brainjam && python manage.py migrate && gunicorn brainjam.wsgi:application --bind 0.0.0.0:$PORT`

**Netlify config:** `netlify.toml` at repo root — base: `frontend`, command: `npm run build`, publish: `dist`. Also has `/api/*` proxy redirect to Railway (fallback, but `.env.production` takes priority).

**Railway env vars required:**
- `GROQ_API_KEY`
- `GEMINI_API_KEY` (must be `AIzaSy...` format from Google AI Studio — `AQ.` format is invalid)
- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS=brainjam-production.up.railway.app`
- `CORS_ALLOWED_ORIGINS=https://graspit.netlify.app`

**⚠️ SQLite wipes on every Railway redeploy** — re-register after each deploy before demoing.

**Deploy workflow:**
1. Push changes to `Enrikkk/BrainJam` (origin)
2. Go to `github.com/Boisset-C/BrainJam` → **Sync fork → Update branch**
3. Netlify auto-deploys; Railway auto-deploys

---

## Environment (local dev)

- **Backend:** `cd backend && source venv/bin/activate && cd brainjam && python -u manage.py runserver`
- **Frontend:** `cd frontend && CHOKIDAR_USEPOLLING=1 PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev` — runs on port 5175 (or 5177 if ports in use)
- **Build check:** `cd frontend && PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build`
- **API keys:** at `BrainJam/.env` (GROQ_API_KEY, GEMINI_API_KEY) — do NOT commit
- **DB:** SQLite at `backend/brainjam/db.sqlite3`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TanStack Router v1 + TanStack Query + Tailwind CSS v4 |
| Backend | Django + Django REST Framework |
| Auth | djangorestframework-simplejwt (JWT) |
| Transcription | Groq Whisper large-v3 |
| Generation | Google Gemini 2.5 Flash (`gemini-2.5-flash`) |
| Styling | Tailwind CSS v4 + `@tailwindcss/typography` |
| Office parsing | `python-pptx`, `python-docx`, `openpyxl` |
| Anki export | `genanki` |

---

## Route Map (current)

| Path | Component | File |
|---|---|---|
| `/login` | LoginPage | `routes/login.tsx` |
| `/register` | RegisterPage | `routes/register.tsx` |
| `/` | HomePage (dashboard) | `routes/home.tsx` |
| `/record` | RecordPage | `routes/index.tsx` |
| `/results` | ResultsPage | `routes/results.tsx` |
| `/courses` | CoursesPage | `routes/courses.tsx` |
| `/courses/:courseId` | CourseDetailPage | `routes/course.tsx` |
| `/courses/:courseId/topics/:tag` | TopicPage | `routes/topic.tsx` |
| `/lectures/:lectureId` | LecturePage | `routes/lecture.tsx` |

---

## API Endpoints (all require Bearer token unless noted)

```
POST   /api/auth/register/          { email, username, password } → { tokens, user }
POST   /api/auth/login/             { email, password } → { tokens, user }
POST   /api/auth/logout/            { refresh } → 204
POST   /api/auth/refresh/           { refresh } → { access }
GET    /api/auth/me/                → { id, email, username }

POST   /api/process/                multipart: audio?, images?, files? → generated content
GET    /api/search/?q=&course_id=   full-text search

GET    /api/courses/                list courses
POST   /api/courses/                create course
GET    /api/courses/default/        find-or-create "Miscellaneous" catch-all
GET    /api/courses/:id/            course detail (includes lectures, exam_scores)
PUT    /api/courses/:id/            update course
DELETE /api/courses/:id/            delete course
GET    /api/courses/:id/exam/?tag=  get cached exam
POST   /api/courses/:id/exam/       { tag } → generate exam
PATCH  /api/courses/:id/exam/       { tag, score, total } → save score
GET    /api/courses/:id/topic/?tag= combined notes + flashcards for a tag
GET    /api/courses/:id/anki/?tag=  export .apkg (tag optional)
POST   /api/courses/:id/chat/       streaming AI chat (SSE)

GET    /api/lectures/recent/        last 4 lectures with course info
POST   /api/lectures/               save lecture + flashcards
GET    /api/lectures/:id/           lecture detail
PATCH  /api/lectures/:id/           { transcript?, tags? }
DELETE /api/lectures/:id/           delete
POST   /api/lectures/:id/regenerate/ regenerate from transcript
GET    /api/lectures/:id/anki/      export .apkg
```

---

## Key Files

```
BrainJam/
├── CLAUDE.md                    ← full project context + session log
├── compact_context.md           ← this file
├── netlify.toml                 ← Netlify build config + /api/* proxy
├── .env                         ← API keys (not committed)
├── GraspIt_Presentation.pptx   ← hackathon slides (generated, not committed)
├── frontend/
│   ├── .env.production          ← VITE_API_URL=https://brainjam-production.up.railway.app
│   ├── public/
│   │   ├── logo.png             ← transparent background logo
│   │   ├── favicon.ico
│   │   ├── favicon-32x32.png
│   │   └── favicon-16x16.png
│   └── src/
│       ├── routeTree.tsx        ← all routes + auth guard (renamed from .ts — uses JSX)
│       ├── api.ts               ← typed fetch wrappers; API_BASE from VITE_API_URL
│       ├── authStore.ts         ← localStorage auth
│       ├── store.ts             ← ephemeral results store
│       ├── routes/
│       │   ├── home.tsx         ← post-login dashboard (logo, greeting, CTA, recent, courses)
│       │   ├── index.tsx        ← RecordPage (at /record)
│       │   ├── results.tsx
│       │   ├── courses.tsx
│       │   ├── course.tsx
│       │   ├── lecture.tsx
│       │   ├── topic.tsx
│       │   ├── login.tsx
│       │   └── register.tsx
│       └── components/
│           ├── AudioRecorder.tsx
│           ├── PhotoCapture.tsx
│           ├── ContextFiles.tsx
│           ├── FlashCard.tsx
│           ├── NotesViewer.tsx
│           ├── SearchModal.tsx
│           ├── AuthLayoutWrapper.tsx
│           ├── UserMenu.tsx
│           └── CourseChat.tsx
└── backend/
    ├── railway.toml             ← Railway start command
    ├── requirements.txt
    └── brainjam/
        ├── Procfile             ← (legacy, railway.toml takes precedence)
        ├── manage.py
        └── api/
            ├── views.py
            ├── urls.py
            ├── models.py
            └── serializers.py
```

---

## Design System

- **Page background:** `bg-[#fafafa]`
- **Sticky nav:** `sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 h-14`
- **Content container:** `max-w-2xl mx-auto px-5 sm:px-6`
- **Section cards:** `bg-white border border-gray-100 rounded-2xl`
- **Primary CTA:** `bg-gradient-to-r from-indigo-600 to-violet-600`
- **NO** page background gradients; **NO** `shadow-xl`; **NO** `window.confirm()`

---

## Important Patterns & Gotchas

- **`VITE_API_URL`** — baked into build via `frontend/.env.production`; Netlify env var alone was not being picked up
- **Netlify proxy strips Authorization header** — do NOT rely on Netlify proxy for authenticated requests; use `VITE_API_URL` direct calls
- **Netlify proxy 10MB limit** — audio uploads must go directly to Railway, not through Netlify
- **SQLite wipes on Railway redeploy** — re-register after every Railway deploy
- **TanStack Router v1** — no file-based routing; all routes in `routeTree.tsx` (`.tsx` extension — uses JSX)
- **React 19 + TanStack Router** — route components that call page components as plain functions (`PageComponent({props})`) crash with error #310. Must use named wrapper components with JSX (`<PageComponent props />`). See `routeTree.tsx` for the `CourseDetailWrapper`, `LectureWrapper`, `TopicWrapper` pattern.
- **React 19 + navigate + invalidateQueries** — calling `qc.invalidateQueries()` immediately before `navigate()` in a mutation `onSuccess` causes #310 (state update during render). Remove `invalidateQueries` from any `onSuccess` that also calls `navigate` — TanStack Query refetches stale data automatically on remount.
- **`flushSync` on navigate** — `index.tsx` uses `flushSync(() => { setLoadingStep('idle'); setCurrentAudioIndex(0) })` before `navigate({ to: '/results' })` to prevent React 19 batching conflicts.
- **Module-level store** — `store.ts` passes results RecordPage → ResultsPage
- **Gemini thinking model** — `gemini-2.5-flash` wraps JSON in markdown; `_run_gemini()` uses regex extraction
- **`courses/default/`** — must be before `courses/<int:pk>/` in `urls.py`
- **`lectures/recent/`** — must be before `lectures/<int:pk>/` in `urls.py`
- **JSONField tag queries** — Python-level filter only (SQLite limitation)
- **npm PATH** — `~/.nvm/versions/node/v20.20.2/bin`
- **Frontend port (local)** — 5175 (may be 5177 if ports in use)
- **Groq rate limit** — 7200 seconds of audio per hour on free tier; keep demo clips under 10 minutes

---

## Session 3 — Deployment Work (March 26-27, 2026)

1. **Created `backend/brainjam/Procfile`** — Railway start command
2. **Updated `netlify.toml`** — added `/api/*` proxy redirect to Railway
3. **Created `frontend/.env.production`** — `VITE_API_URL` baked into build
4. **Created `backend/railway.toml`** — persists start command, fixes Railpack detection
5. **Logo transparent background** — BFS flood fill to remove studio background; saved to `frontend/public/logo.png`
6. **Favicon generated** — `favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png` in `frontend/public/`
7. **Logo added to homepage hero** — `h-20` above greeting in `routes/home.tsx`
8. **Hackathon slides** — `GraspIt_Presentation.pptx` generated (13 slides, dark indigo theme)
9. **Deployment fork** — user's fork is `Boisset-C/BrainJam`; push to `Enrikkk/BrainJam` then sync fork

## Session 4 — Production Debugging (March 27, 2026)

1. **Fixed `/api/process/` using hardcoded relative URL** — was ignoring `VITE_API_URL`, always going through Netlify proxy. Fixed: `fetch(\`${API_BASE}/api/process/\`, ...)` in `index.tsx`
2. **Added detailed error messages** — HTTP status + hostname + response body shown in error banner
3. **React 19 error #310 — root cause 1**: `routeTree.ts` called `CourseDetailPage({...})`, `LecturePage({...})`, `TopicPage({...})` as plain functions. React 19 forbids this when components use hooks. Fixed: named wrapper components (`CourseDetailWrapper` etc.) using JSX. File renamed `routeTree.tsx`.
4. **React 19 error #310 — root cause 2**: `invalidateQueries` + `navigate` in same `onSuccess` callback triggers state update during render. Fixed: removed `invalidateQueries` from `onSuccess` in `home.tsx`, `courses.tsx`, `course.tsx` where navigate also called.
5. **React 19 error #310 — root cause 3**: `setLoadingStep('idle')` in `finally` block conflicting with `navigate`. Fixed: `flushSync` wraps the state resets, navigate called after.
6. **Hooks before early return** — `useCallback`/`useEffect` in `results.tsx` were after a conditional early return. Moved before.
7. **Groq rate limit hit** — 7200s/hour free tier; hit by uploading same 50-min file repeatedly. Wait 1 hour or use shorter clips.
8. **Generation returning `{}`** — Gemini API key was invalid (`AQ.` format). Fixed by setting valid `AIzaSy...` key in Railway env vars.

---

## How to Pick Up After Compact

1. Read this file first
2. Run `git status` and `git log --oneline -5`
3. If deploying: sync `Boisset-C/BrainJam` fork on GitHub → Netlify + Railway auto-deploy
4. If running locally: start backend first, then frontend (commands above)
5. After any Railway redeploy: clear `bj_*` from localStorage and re-register
