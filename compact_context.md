# BrainJam — Compact Context

> **Purpose:** Read this file after a context compaction to restore full project context without re-reading history. Keep it updated after every session.

---

## What is BrainJam?

A lecture-to-study-materials web app built for a hackathon (deadline: **March 27, 2026 — midday presentation**). Students record or upload lecture audio, snap whiteboard photos, or attach context files (PDFs, slides). The app generates flashcards, notes, title, summary, and topic tags. Users organise saved lectures into courses, study by topic, and take AI-generated exams.

**Repo:** https://github.com/Enrikkk/BrainJam (private)

---

## Environment

- **Working branch:** `agent-two` (branched from `fancy-features`, ahead of `main`)
- **Backend:** `cd backend && source venv/bin/activate && cd brainjam && python -u manage.py runserver`
- **Frontend:** `cd frontend && CHOKIDAR_USEPOLLING=1 PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run dev` — runs on port 5175
- **Build check:** `cd frontend && PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build`
- **API keys:** at `BrainJam/.env` (GROQ_API_KEY, GEMINI_API_KEY) — do NOT commit
- **DB:** SQLite at `backend/brainjam/db.sqlite3`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TanStack Router v1 + TanStack Query + Tailwind CSS v4 |
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
| `/` | **HomePage** (new!) | `routes/home.tsx` |
| `/record` | RecordPage | `routes/index.tsx` |
| `/results` | ResultsPage | `routes/results.tsx` |
| `/courses` | CoursesPage | `routes/courses.tsx` |
| `/courses/:courseId` | CourseDetailPage | `routes/course.tsx` |
| `/courses/:courseId/topics/:tag` | TopicPage | `routes/topic.tsx` |
| `/lectures/:lectureId` | LecturePage | `routes/lecture.tsx` |

> **Key routing note:** RecordPage moved from `/` → `/record` in this session. The new `/` is the home dashboard.

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
GET    /api/courses/default/        find-or-create "Miscellaneous" catch-all course
GET    /api/courses/:id/            course detail (includes lectures, exam_scores)
PUT    /api/courses/:id/            update course
DELETE /api/courses/:id/            delete course
GET    /api/courses/:id/exam/?tag=  get cached exam
POST   /api/courses/:id/exam/       { tag } → generate exam
PATCH  /api/courses/:id/exam/       { tag, score, total } → save score
GET    /api/courses/:id/topic/?tag= combined notes + flashcards for a tag
GET    /api/courses/:id/anki/?tag=  export .apkg (tag optional)
POST   /api/courses/:id/chat/       streaming AI chat (SSE)

GET    /api/lectures/recent/        last 4 lectures with course info (NEW)
POST   /api/lectures/               save lecture + flashcards
GET    /api/lectures/:id/           lecture detail
PATCH  /api/lectures/:id/           { transcript?, tags? }
DELETE /api/lectures/:id/           delete
POST   /api/lectures/:id/regenerate/ regenerate from transcript
GET    /api/lectures/:id/anki/      export .apkg
```

---

## Design System (established this session)

**The rule:** Every page uses the same Apple-inspired design language.

- **Page background:** `bg-[#fafafa]`
- **Sticky nav:** `sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14`
  - Left: `← [Back label]` in `text-sm font-medium text-indigo-500 hover:text-indigo-700`
  - Right: action buttons + `<UserMenu />`
- **Content container:** `max-w-2xl mx-auto px-5 sm:px-6`
- **Page hero:** `pt-10 pb-8` with `text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight`
- **Section cards:** `bg-white border border-gray-100 rounded-2xl`
- **Primary CTA:** `bg-gradient-to-r from-indigo-600 to-violet-600` with icon + chevron
- **Tabs (inside cards):** `flex border-b border-gray-100 px-1 pt-1 gap-1` with active tab `text-indigo-700 bg-indigo-50`
- **Secondary text:** `text-gray-400`
- **Back/breadcrumb links:** `text-indigo-500 hover:text-indigo-700`
- **NO** gradients on page backgrounds; **NO** `shadow-xl` floating cards; **NO** `rounded-3xl` main containers (only modals)

---

## Key Files

```
BrainJam/
├── CLAUDE.md                  ← full project context + session log
├── compact_context.md         ← this file (quick context restore after compact)
├── .env                       ← API keys (not committed)
├── frontend/src/
│   ├── routeTree.ts           ← all routes + auth guard
│   ├── api.ts                 ← typed fetch wrappers
│   ├── authStore.ts           ← localStorage auth (getAuthUser, getAccessToken, etc.)
│   ├── store.ts               ← ephemeral results store (RecordPage → ResultsPage)
│   ├── routes/
│   │   ├── home.tsx           ← NEW: post-login dashboard
│   │   ├── index.tsx          ← RecordPage (at /record)
│   │   ├── results.tsx        ← results + save to course
│   │   ├── courses.tsx        ← course list
│   │   ├── course.tsx         ← course detail
│   │   ├── lecture.tsx        ← lecture detail (tabs, transcript edit, tags)
│   │   ├── topic.tsx          ← topic study + exam
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── components/
│       ├── AudioRecorder.tsx
│       ├── PhotoCapture.tsx
│       ├── ContextFiles.tsx
│       ├── FlashCard.tsx
│       ├── NotesViewer.tsx
│       ├── SearchModal.tsx    ← Cmd+K command palette
│       ├── AuthLayoutWrapper.tsx ← mounts SearchModal + Cmd+K listener
│       ├── UserMenu.tsx
│       └── CourseChat.tsx     ← streaming AI chat panel
└── backend/brainjam/api/
    ├── views.py               ← all business logic
    ├── urls.py                ← all URL patterns
    ├── models.py              ← Course, Lecture, Flashcard, TopicExam
    └── serializers.py
```

---

## Everything Done in This Project (cumulative)

### Session 1 (earlier — from previous compact)

1. **Environment setup** — installed missing packages, migrated DB, fixed npm PATH
2. **Gemini malformed JSON** — raised `max_output_tokens` 8192→65536; regex-based JSON extraction for thinking-model output
3. **Audio optional** — `POST /api/process/` accepts photos/files alone; frontend enables Generate on any input
4. **Hallucination guard** — Gemini prompted to return `{"insufficient_content": true}` for thin input; backend returns 422
5. **Empty state fix** — results page distinguishes `state === null` vs empty flashcards
6. **Auto-save to Miscellaneous** — results page saves to default course on unmount if user didn't manually save
7. **Miscellaneous option in save panel** — "Miscellaneous (no course)" option in the save dropdown
8. **`GET /api/courses/default/`** — find-or-create Miscellaneous course endpoint
9. **QA guide** — full walkthrough guide created as a plan (covers all features end-to-end)

### Session 2 (this session)

10. **Home page** (`/`) — Apple-inspired post-login dashboard with time-aware greeting, gradient CTA, recent lectures, course list
11. **RecordPage moved** to `/record`; all links updated
12. **`GET /api/lectures/recent/`** — returns last 4 lectures with course name + color
13. **Full design system redesign** — all 8 pages now share the Apple-inspired design:
    - `bg-[#fafafa]` everywhere (no more gradients)
    - Sticky frosted-glass nav on every page
    - Flat `border border-gray-100` cards (no `shadow-xl`)
    - Consistent back navigation + UserMenu in nav bar
    - Vertical list layout for CoursesPage
    - Section cards for RecordPage inputs
    - Tab strip inside content card for Results/Lecture/Topic pages

---

## Pending / Known State

- **Uncommitted changes:** `CLAUDE.md`, `compact_context.md`, and all the frontend/backend files from both sessions are **not yet committed** to `agent-two` or pushed to `main`
- **Branch:** currently on `agent-two`; to push to main: merge agent-two → main or cherry-pick
- **No dark mode** — not implemented; decided to skip for hackathon
- **Presentation tomorrow (March 27, 2026, midday)** — QA guide is in the plan file at `/home/codecomb/.claude/plans/idempotent-waddling-kahan.md`

---

## Important Patterns & Gotchas

- **TanStack Router v1** — no file-based routing; all routes manually declared in `routeTree.ts`; parameterised routes use wrapper components with `route.useParams()`
- **Module-level store** — `store.ts` passes results from RecordPage → ResultsPage (not route state)
- **Gemini is a thinking model** — `gemini-2.5-flash` sometimes wraps JSON in markdown or adds preamble; the `_run_gemini()` function in `views.py` handles this with regex extraction
- **Audio MIME detection** — backend detects from `Content-Type` header first, then file extension
- **`courses/default/` URL** — must be declared BEFORE `courses/<int:pk>/` in `urls.py`
- **`lectures/recent/` URL** — must be declared BEFORE `lectures/<int:pk>/` in `urls.py`
- **`lectures/` (POST)** — must be declared AFTER `lectures/recent/` (GET) in `urls.py`
- **Python unbuffered output** — start backend with `python -u manage.py runserver`
- **npm PATH** — `~/.nvm/versions/node/v20.20.2/bin/npm`; export PATH before using
- **Frontend port** — 5175 (5173 and 5174 were occupied)
- **JSONField tag queries** — use Python-level filter `[l for l in lectures if tag in (l.tags or [])]` not `filter(tags__contains=[tag])` (SQLite compatibility)
- **Anki model ID** — fixed at `1607392319` to prevent duplicate model definitions on re-import
- **Auto-save keepalive** — uses `fetch(..., { keepalive: true })` in ResultsPage unmount effect; needs `useRef` for `saved` state to avoid stale closure

---

## How to Pick Up After Compact

1. Read this file first (`compact_context.md`)
2. Check `git status` to see uncommitted changes
3. The QA guide is at `/home/codecomb/.claude/plans/idempotent-waddling-kahan.md`
4. If running the app: start backend first, then frontend (commands above)
5. Check `CLAUDE.md` for the full detailed session log if you need specifics
