# BrainJam — Project Context

## What is BrainJam?

BrainJam is a lecture-to-study-materials web app built for a hackathon. Students record a lecture audio (or upload an existing file), optionally snap/upload photos of whiteboards/slides, and optionally attach context files (PDFs, slides, notes). The app automatically generates flashcards, structured notes, a title, and a summary. Users can create courses to organise saved lectures.

**Hackathon deadline:** Thursday March 27, 2026 — midday presentation.
**Repo:** https://github.com/Enrikkk/BrainJam (private)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TanStack Router v1 + TanStack Query + Tailwind CSS v4 |
| Backend | Django + Django REST Framework |
| Auth | djangorestframework-simplejwt (JWT, 1-day access / 30-day refresh, token blacklist on logout) |
| Transcription | Groq Whisper large-v3 (free, OpenAI-compatible API) |
| Generation + Vision | Google Gemini 2.5 Flash (`gemini-2.5-flash`) |
| Styling | Tailwind CSS v4 with `@tailwindcss/typography` |
| Office file parsing | `python-pptx`, `python-docx`, `openpyxl` |

---

## Project Structure

```
BrainJam/
├── CLAUDE.md                  ← you are here
├── .env                       ← GROQ_API_KEY, GEMINI_API_KEY (do NOT commit)
├── frontend/
│   ├── vite.config.ts         ← Tailwind plugin + proxy /api → localhost:8000
│   ├── src/
│   │   ├── index.css          ← @import "tailwindcss"; @plugin "@tailwindcss/typography"
│   │   ├── main.tsx           ← RouterProvider + QueryClientProvider; window.__test() dev helper
│   │   ├── routeTree.ts       ← TanStack Router route definitions (auth guard layout route)
│   │   ├── store.ts           ← Module-level store (setResults/getResults) for ephemeral results
│   │   ├── authStore.ts       ← localStorage-backed auth store (tokens + user info)
│   │   ├── api.ts             ← Typed fetch wrappers; auto-attaches Bearer token
│   │   ├── routes/
│   │   │   ├── index.tsx      ← RecordPage (record/upload audio, photos, context files, generate)
│   │   │   ├── results.tsx    ← ResultsPage (flashcards/notes/transcript + save-to-course panel)
│   │   │   ├── courses.tsx    ← CoursesPage (grid of course cards, create course modal)
│   │   │   ├── course.tsx     ← CourseDetailPage (lecture list, stats)
│   │   │   ├── lecture.tsx    ← LecturePage (saved lecture view, fetched from DB)
│   │   │   ├── login.tsx      ← LoginPage
│   │   │   └── register.tsx   ← RegisterPage
│   │   └── components/
│   │       ├── AudioRecorder.tsx   ← Record mode + Upload file mode toggle
│   │       ├── PhotoCapture.tsx    ← Take photo (camera) + Upload photo (gallery) buttons
│   │       ├── ContextFiles.tsx    ← Arbitrary file uploads (PDF, DOCX, PPTX, TXT, images…)
│   │       ├── UserMenu.tsx        ← Avatar dropdown with username, email, sign out
│   │       ├── FlashCard.tsx
│   │       └── NotesViewer.tsx
│   └── package.json
└── backend/
    └── brainjam/
        ├── manage.py
        ├── db.sqlite3
        ├── brainjam/
        │   ├── settings.py    ← AUTH_USER_MODEL, JWT config, DRF config, CORS
        │   └── urls.py
        ├── users/             ← Custom User model (email login + username display)
        │   └── models.py
        └── api/
            ├── urls.py        ← all API endpoints
            ├── views.py       ← process pipeline + auth + courses/lectures CRUD
            ├── models.py      ← Course, Lecture, Flashcard
            └── serializers.py
```

---

## Running Locally

**Backend:**
```bash
cd backend && source venv/bin/activate && cd brainjam && python manage.py runserver
# Runs on http://localhost:8000
```

**Frontend:**
```bash
cd frontend && CHOKIDAR_USEPOLLING=1 npm run dev
# Runs on http://localhost:5173
# /api/* proxied to http://localhost:8000
# NOTE: plain `npm run dev` may fail with ENOSPC (inotify limit) — use CHOKIDAR_USEPOLLING=1
```

**Dev test helper** (browser console on any page):
```js
window.__test({
  flashcards: [{front: "What is a neuron?", back: "A cell that transmits signals."}],
  notes: "## Key Takeaways\n\n- Neurons transmit signals\n\n## Neurons\n\n- **Neurons** are cells",
  transcript: "Today we will talk about neurons and the nervous system...",
  title: "Introduction to Neuroscience",
  summary: "This lecture covers how neurons transmit signals in the nervous system."
})
```

There is also a **"Load demo data"** button at the bottom of the RecordPage (only visible when not loading) — loads a sample photosynthesis lecture without recording. Useful for demo day.

---

## Authentication

- Custom `users.User` model: `email` is the login field (`USERNAME_FIELD`), `username` is the display name
- JWT via `djangorestframework-simplejwt`: access token 1 day, refresh token 30 days
- Token blacklist enabled — logout invalidates the refresh token on that device only
- Tokens stored in `localStorage` keys: `bj_access`, `bj_refresh`, `bj_user`
- All API calls in `api.ts` auto-attach `Authorization: Bearer <token>`
- `multipart/form-data` calls (audio processing) manually attach the header via `getAccessToken()`
- Multi-computer login works: each device gets independent tokens; same account can be active on multiple devices simultaneously

**Auth endpoints:**
```
POST /api/auth/register/   { email, username, password } → { tokens, user }
POST /api/auth/login/      { email, password }           → { tokens, user }
POST /api/auth/logout/     { refresh }                   → 204
POST /api/auth/refresh/    { refresh }                   → { access }
GET  /api/auth/me/                                       → { id, email, username }
```

**Route protection (routeTree.ts):**
- `authLayout` route with `id: '_auth'` and `beforeLoad` guard wraps all protected routes
- Unauthenticated → redirected to `/login`; already-logged-in → `/login` and `/register` redirect to `/courses`

---

## Database (SQLite)

Three models in `api/models.py`:

```
Course   — user (FK→User), name, description, color (#hex), created_at, updated_at
Lecture  — course (FK→Course), title, summary, transcript, notes, created_at
Flashcard — lecture (FK→Lecture), front, back, order
```

All course/lecture queries are scoped to `request.user` — users never see each other's data.

**CRUD endpoints:**
```
GET/POST   /api/courses/          list / create course
GET/PUT/DELETE /api/courses/:id/  course detail (includes lecture list) / update / delete
POST       /api/lectures/         save lecture + flashcards
GET/DELETE /api/lectures/:id/     lecture detail / delete
```

---

## API Pipeline

```
POST /api/process/  (multipart/form-data)  — requires Bearer token
  Fields:
    audio   — audio blob (webm from MediaRecorder, or uploaded mp3/wav/m4a/ogg/flac/aac)
    images  — (optional) whiteboard/slide photos
    files   — (optional) context files (PDF, DOCX, PPTX, XLSX, TXT, images, etc.)

Steps:
  1. Detect audio MIME type from Content-Type header + file extension fallback
  2. Groq Whisper large-v3 → transcript text (30s timeout)
  3. Gemini 2.5 Flash (with optional images + context files) → JSON (60s timeout)

Response:
  {
    "title": "Short Lecture Title",
    "summary": "1-2 sentence overview.",
    "flashcards": [{"front": "...", "back": "..."}],
    "notes": "## Key Takeaways\n...",
    "transcript": "raw transcript text..."
  }
```

**Context file handling in views.py** (checks both MIME type AND file extension):
| Format | How it's processed |
|---|---|
| Images (png/jpg/webp/heic…) | PIL Image → passed inline to Gemini |
| PDF | `types.Part.from_bytes` inline (Gemini reads PDFs natively) |
| PPTX / PPT | `python-pptx` → text extracted slide-by-slide |
| DOCX / DOC | `python-docx` → text extracted paragraph-by-paragraph |
| XLSX / XLS | `openpyxl` → cell data extracted sheet-by-sheet |
| TXT / MD / CSV / JSON / code | Read as UTF-8 string |
| Unknown binary | UTF-8 decode attempted; skipped if binary |

**Audio MIME resolution (views.py):**
MIME type is detected from `Content-Type` header first, then file extension. Handles `audio/x-m4a → audio/m4a`, `audio/x-wav → audio/wav`, etc. Previously hardcoded `audio/webm` caused transcription failures for uploaded MP3/WAV files.

---

## Frontend Routes

| Path | Component | Notes |
|---|---|---|
| `/login` | LoginPage | Public; redirects to `/courses` if already authed |
| `/register` | RegisterPage | Public; redirects to `/courses` if already authed |
| `/` | RecordPage | Protected |
| `/results` | ResultsPage | Protected; ephemeral (module-level store) |
| `/courses` | CoursesPage | Protected |
| `/courses/:courseId` | CourseDetailPage | Protected; props via `route.useParams()` |
| `/lectures/:lectureId` | LecturePage | Protected; fetches from DB |

---

## Key Components

### AudioRecorder.tsx
Two modes toggled by a tab bar:
- **Record** — microphone recording with live timer; mic permission error shown inline
- **Upload file** — file picker accepting MP3, WAV, M4A, OGG, FLAC, AAC, WebM, MP4
- On API error, the parent error banner shows *"Your recording is preserved — just try again."*
- `onReset` prop clears the parent's `audioBlob` when user explicitly re-records/changes file
- Callback: `onRecordingComplete(blob, filename)` — filename used so Groq gets the correct extension

### PhotoCapture.tsx
Two separate buttons:
- **Take photo** — `capture="environment"` → opens back camera directly on mobile
- **Upload photo** — no `capture` attribute → opens gallery/file picker on mobile and desktop

### ContextFiles.tsx
- Drag-and-drop style file list with emoji icons, name, size, remove button
- Accepts: `.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,image/*`

### UserMenu.tsx
- Avatar circle (first letter of username) + dropdown
- Shows username + email; sign-out button blacklists refresh token then clears localStorage

### ResultsPage save-to-course panel
After generating, a panel appears at the bottom to save the lecture:
- Pick an existing course or create a new one inline (name + color picker)
- On save: POST `/api/lectures/` with all data; shows "Lecture saved!" + link to `/lectures/:id`

---

## Environment Variables

Located at `/home/enrikkk/Desktop/Computer Science/BrainJam/.env`:
```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
```

---

## Key Architecture Decisions

### Module-Level Store (store.ts)
TanStack Router v1 does not support passing state between routes. Ephemeral results (just generated) are passed RecordPage → ResultsPage via a module-level variable. Saved lectures are fetched from the DB at `/lectures/:id`.

### Groq Audio MIME Type
The backend detects MIME type from the `Content-Type` header and falls back to the file extension. Previously hardcoded `audio/webm` — now supports any format Groq Whisper accepts (mp3, wav, m4a, ogg, flac, aac, webm, mp4).

### Gemini File Support
Gemini only accepts specific MIME types as inline bytes (images, PDFs, audio, video). PPTX/DOCX/XLSX are **not** supported inline — text must be extracted first using `python-pptx` / `python-docx` / `openpyxl` and passed as strings.

### TanStack Router v1 Parameterised Routes
No file-based routing. Parameterised routes are defined in `routeTree.ts` with a wrapper component that calls `route.useParams()` and passes props to the page component. This avoids circular imports.

### JWT Multi-Device
Access tokens are stateless — no server-side session. Each device logs in independently and gets its own token pair. Logout blacklists only the refresh token used on that device; other devices remain logged in.

---

## Known Issues / Past Fixes

- Empty `flashcards: []` from Gemini crashed UI — fixed: guard `!state?.flashcards || state.flashcards.length === 0`
- Gemini rejects PPTX/DOCX as inline bytes — fixed: extract text with `python-pptx` / `python-docx`
- Hardcoded `audio/webm` MIME type broke MP3 uploads to Groq — fixed: MIME detection from header + extension
- `capture="environment"` on PhotoCapture forced camera, no gallery option on mobile — fixed: two separate inputs
- TanStack Router v1 doesn't support route state → module-level store pattern
- Gemini model must be `gemini-2.5-flash` (not 2.0 or 1.5 — not available on this account)
- `load_dotenv` must be called after `BASE_DIR` is defined in settings.py
- `npm run dev` may fail with `ENOSPC: System limit for number of file watchers reached` → use `CHOKIDAR_USEPOLLING=1 npm run dev`
- `Outlet` from TanStack Router v1 is a `React.memo` object (`typeof === 'object'`), not a function — still a valid React component, works as `component: Outlet` in `createRoute`

---

## Out of Scope

- React Native mobile app (planned post-hackathon)
- Export to Anki/PDF
- Real-time transcription
- Audio chunking for files >25 MB
- Password reset / email verification
