# BrainJam — Project Context

## What is BrainJam?

BrainJam is a lecture-to-study-materials web app built for a hackathon. Students record a lecture audio (or upload an existing file), optionally snap/upload photos of whiteboards/slides, and optionally attach context files (PDFs, slides, notes). The app automatically generates flashcards, structured notes, a title, a summary, and topic tags. Users can create courses to organise saved lectures, study by topic, and take AI-generated exams with persistent score tracking.

**Hackathon deadline:** Thursday March 27, 2026 — midday presentation.
**Repo:** https://github.com/Enrikkk/BrainJam (private)

---

## Session Work Log (agent-two branch, March 26 2026)

### Environment fixes
- Ran `pip install -r requirements.txt` to install missing packages (`djangorestframework-simplejwt`, `genanki`, `anthropic`) that were absent from the venv
- Deleted stale `db.sqlite3` and ran `python manage.py migrate` fresh (inconsistent migration history)
- Backend must be started with `python -u manage.py runserver` (unbuffered stdout) so `print()` debug logs flush immediately to the log file
- npm is at `~/.nvm/versions/node/v20.20.2/bin/npm` — must be on PATH or use full path
- Frontend runs on port 5175 (5173 and 5174 were in use)

### Branch state
- Working branch: `agent-two` (branched from `fancy-features`, which is ahead of `main`)
- All fixes from this session were committed and pushed to `main` (commit `a1f1c3c`)

### Session 2 additions (agent-two, March 26 2026 — continued)

#### Home page & design system overhaul

7. **New home page at `/`** — created `frontend/src/routes/home.tsx`:
   - Apple-inspired full-page layout: flat `bg-[#fafafa]`, sticky frosted-glass nav (`bg-white/80 backdrop-blur-md`), generous whitespace
   - Greeting section: time-aware ("Good morning / afternoon / evening, [name]."), large bold typography
   - Primary CTA: indigo→violet gradient button "Start a new lecture" with mic icon + chevron
   - "Recently saved" section: last 4 lectures from new `GET /api/lectures/recent/` endpoint, shown as clean cards with course color dot, title, time-ago, card count
   - "Courses" section: vertical list with colored initials, lecture count, chevron; "+ New Course" inline modal; Miscellaneous course filtered from list
   - RecordPage moved from `/` → `/record`; new home route at `/`

8. **`GET /api/lectures/recent/`** — new backend endpoint in `views.py`, URL added before `lectures/<int:pk>/` in `urls.py`:
   ```python
   Lecture.objects.filter(course__user=request.user).select_related('course').order_by('-created_at')[:4]
   ```
   Returns: `id, title, created_at, course_id, course_name, course_color, flashcard_count`

9. **Full design system redesign** — all 8 pages now share a single design language:
   - **Removed** `bg-gradient-to-br from-indigo-50 to-purple-50` everywhere → `bg-[#fafafa]`
   - **Removed** `shadow-xl` floating white card pattern → content directly on page in `bg-white border border-gray-100 rounded-2xl` section cards
   - **Added** sticky nav to every protected page: `sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 h-14`
   - **Standardised** content container: `max-w-2xl mx-auto px-5 sm:px-6`
   - **Tabs** (results/lecture/topic): moved from `bg-gray-100 p-1` pill strip → top-border tab strip inside the content card
   - **Login/Register**: brand name above the card, not inside it; `shadow-sm` instead of `shadow-xl`
   - **Courses page**: vertical list layout (like home page) instead of 2-column grid; consistent nav
   - **RecordPage**: three section cards (Audio, Photos, Files) + Generate CTA using same gradient button as home
   - **CoursesPage**: `← Home` nav, search + New Course in nav bar
   - **CourseDetailPage**: `← My Courses` nav + search/chat/New Lecture icons in nav bar
   - **LecturePage**: `← Back to course` nav + delete icon in nav bar
   - **TopicPage**: `← [Course name]` nav; exam empty state updated to SVG icon

10. **Routing updates** — all links updated:
    - `login.tsx`, `register.tsx`: navigate to `/` after auth success
    - `routeTree.ts`: `beforeLoad` redirects for `/login`/`/register` changed from `/courses` → `/`
    - `course.tsx`: "+ Record Lecture" and "Record your first lecture" links → `/record`
    - `results.tsx`: "← Record new" → `/record`
    - `courses.tsx`: "← Record" → "← Home"

### Bug fixes shipped (Session 1)
1. **Gemini malformed JSON** — two root causes fixed in `api/views.py`:
   - `max_output_tokens` raised from 8192 → 65536 (truncated JSON on large PDFs was the primary cause)
   - JSON extraction now uses regex (`re.search(r'```(?:json)?\s*([\s\S]*?)```')`) and falls back to extracting the outermost `{...}` or `[...]` — handles gemini-2.5-flash thinking-model output

2. **Audio required to generate** — made audio optional in `POST /api/process/`:
   - Returns 400 only if ALL of audio, images, and files are missing
   - Transcription step is skipped entirely when no audio provided
   - Short/bad transcripts (< 10 chars) fall back to image/context-only prompt instead of failing
   - Frontend: Generate button now enables when ANY input present (audio OR photos OR files); loading steps skip "Transcribing" when no audio; Step 1 header says "(optional)"

3. **Hallucination prevention** — system prompt updated to instruct Gemini to return `{"insufficient_content": true, "reason": "..."}` instead of hallucinating when input is too thin; backend checks this flag and returns 422 with a user-facing message

4. **"No results yet" misleading empty state** — results page now distinguishes:
   - `state === null` (page visited directly) → "No results yet"
   - `state.flashcards.length === 0` (generation returned nothing) → "No flashcards generated — the audio may not have captured enough speech. Try adding a whiteboard photo or uploading an audio file instead."

5. **Auto-save to Miscellaneous on exit** — new `GET /api/courses/default/` endpoint finds-or-creates a "Miscellaneous" course for the user; results page pre-fetches this on mount and fires a `keepalive` fetch on unmount if the lecture wasn't saved to a course

6. **Save without picking a course** — results page save panel now includes a "Miscellaneous (no course)" option alongside existing courses and "New course…"; selecting it calls `api.courses.default()` to resolve the course ID before saving

---

## Tech Stack

| Layer               | Technology                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Frontend            | React + Vite + TanStack Router v1 + TanStack Query + Tailwind CSS v4                          |
| Backend             | Django + Django REST Framework                                                                |
| Auth                | djangorestframework-simplejwt (JWT, 1-day access / 30-day refresh, token blacklist on logout) |
| Transcription       | Groq Whisper large-v3 (free, OpenAI-compatible API)                                           |
| Generation + Vision | Google Gemini 2.5 Flash (`gemini-2.5-flash`)                                                  |
| Styling             | Tailwind CSS v4 with `@tailwindcss/typography`                                                |
| Office file parsing | `python-pptx`, `python-docx`, `openpyxl`                                                      |
| Anki export         | `genanki`                                                                                     |

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
│   │   ├── usePrintNotes.tsx  ← Portal-based print hook for PDF export of notes
│   │   ├── routes/
│   │   │   ├── index.tsx      ← RecordPage (record/upload audio, photos, context files, generate)
│   │   │   ├── results.tsx    ← ResultsPage (flashcards/notes/transcript + save-to-course panel)
│   │   │   ├── courses.tsx    ← CoursesPage (grid of course cards, create course modal)
│   │   │   ├── course.tsx     ← CourseDetailPage (lecture list, topic pills with score badges, avg score, Needs Review)
│   │   │   ├── lecture.tsx    ← LecturePage (flashcards, notes, editable transcript, tags, PDF export, prev/next nav)
│   │   │   ├── topic.tsx      ← TopicPage (combined notes + flashcards across lectures; exam tab with MCQ/numeric/short_answer)
│   │   │   ├── login.tsx      ← LoginPage
│   │   │   └── register.tsx   ← RegisterPage
│   │   └── components/
│   │       ├── AudioRecorder.tsx      ← Record mode + Upload audio file mode toggle
│   │       ├── AuthLayoutWrapper.tsx  ← Auth layout wrapper; mounts SearchModal + Cmd+K listener
│   │       ├── ContextFiles.tsx       ← Arbitrary file uploads (PDF, DOCX, PPTX, TXT, images…)
│   │       ├── FlashCard.tsx
│   │       ├── NotesViewer.tsx
│   │       ├── PhotoCapture.tsx       ← Take photo (camera) + Upload photo (gallery) buttons
│   │       ├── SearchModal.tsx        ← Command-palette search overlay; supports global + course-scoped search
│   │       └── UserMenu.tsx           ← Avatar dropdown with username, email, sign out
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
            ├── views.py       ← process pipeline + auth + courses/lectures CRUD + exam generation
            ├── models.py      ← Course, Lecture, Flashcard, TopicExam
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
	flashcards: [
		{ front: "What is a neuron?", back: "A cell that transmits signals." },
	],
	notes: "## Key Takeaways\n\n- Neurons transmit signals\n\n## Neurons\n\n- **Neurons** are cells",
	transcript: "Today we will talk about neurons and the nervous system...",
	title: "Introduction to Neuroscience",
	summary:
		"This lecture covers how neurons transmit signals in the nervous system.",
});
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

Four models in `api/models.py`:

```
Course     — user (FK→User), name, description, color (#hex), created_at, updated_at
Lecture    — course (FK→Course), title, summary, transcript, notes, tags (JSONField), created_at
Flashcard  — lecture (FK→Lecture), front, back, order
TopicExam  — course (FK→Course), tag, questions (JSONField), lecture_snapshot (JSONField),
             last_score, last_total, attempts; unique_together (course, tag)
```

All course/lecture queries are scoped to `request.user` — users never see each other's data.

**CRUD endpoints:**

```
GET/POST          /api/courses/                   list / create course
GET               /api/courses/default/           find-or-create "Miscellaneous" catch-all course
GET/PUT/DELETE    /api/courses/:id/               course detail / update / delete
GET/POST/PATCH    /api/courses/:id/exam/          get/generate/submit-score for topic exam
GET               /api/courses/:id/topic/         topic data (notes + flashcards across lectures)
GET               /api/courses/:id/anki/?tag=     export topic flashcards as .apkg (tag optional → whole course)
POST              /api/lectures/                  save lecture + flashcards
GET/PATCH/DELETE  /api/lectures/:id/              lecture detail / update (transcript, tags) / delete
POST              /api/lectures/:id/regenerate/   regenerate notes+flashcards from transcript
GET               /api/lectures/:id/anki/         export lecture flashcards as .apkg
GET               /api/search/?q=&course_id=      full-text search; course_id is optional for scoping
```

---

## API Pipeline

```
POST /api/process/  (multipart/form-data)  — requires Bearer token
  Fields:
    audio   — (optional) audio blob (webm from MediaRecorder, or uploaded mp3/wav/m4a/ogg/flac/aac)
    images  — (optional) whiteboard/slide photos
    files   — (optional) context files (PDF, DOCX, PPTX, XLSX, TXT, images, etc.)
  At least one of audio/images/files must be present (400 if all missing)

Steps:
  1. If audio present: detect MIME type, transcribe with Groq Whisper large-v3 (30s timeout)
     - If transcript < 10 chars AND no images/files → 422 "no speech detected"
     - If transcript < 10 chars but images/files present → fall back to image/context-only prompt
  2. Gemini 2.5 Flash (with transcript + optional images + context files) → JSON (60s timeout)
     - max_output_tokens: 65536
     - If Gemini returns {"insufficient_content": true, "reason": "..."} → 422 with user message
     - JSON extraction: strips markdown fences, falls back to regex {..} / [..] extraction

Response:
  {
    "title": "Short Lecture Title",
    "summary": "1-2 sentence overview.",
    "tags": ["tag1", "tag2"],
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
MIME type is detected from `Content-Type` header first, then file extension. Handles `audio/x-m4a → audio/m4a`, `audio/x-wav → audio/wav`, etc.

---

## Frontend Routes

| Path                             | Component        | Notes                                                       |
| -------------------------------- | ---------------- | ----------------------------------------------------------- |
| `/login`                         | LoginPage        | Public; redirects to `/courses` if already authed           |
| `/register`                      | RegisterPage     | Public; redirects to `/courses` if already authed           |
| `/`                              | RecordPage       | Protected                                                   |
| `/results`                       | ResultsPage      | Protected; ephemeral (module-level store)                   |
| `/courses`                       | CoursesPage      | Protected                                                   |
| `/courses/:courseId`             | CourseDetailPage | Protected; props via `route.useParams()`                    |
| `/courses/:courseId/topics/:tag` | TopicPage        | Protected; shows combined notes, flashcards, exam for a tag |
| `/lectures/:lectureId`           | LecturePage      | Protected; fetches from DB                                  |

---

## Key Features

### Tags / Topics

Gemini generates up to 6 topic tags per lecture. Tags are stored as a JSONField on Lecture. Each tag creates a topic page aggregating notes and flashcards from all lectures in that course sharing the tag. Tags can be edited per-lecture in the LecturePage (with suggestions from existing course tags).

### Topic Exams

- Generated on demand via POST `/api/courses/:id/exam/` with a `tag` body param
- Exams are cached in `TopicExam` (unique per course+tag); re-generation overwrites
- `stale` flag is returned when the set of lectures tagged with that topic has changed since generation
- Three question types (discriminated union in TypeScript):
    - `mcq`: 4 options, 0-based correct index, explanation
    - `numeric`: calculation question, worked answer, explanation
    - `short_answer`: open-ended question, model answer
- `normalizeQuestions()` in topic.tsx backfills `type: 'mcq'` on cached exams generated before the type field existed

### Progress Tracking

- After completing an exam, score is saved via PATCH `/api/courses/:id/exam/` with `{ tag, score, total }`
- `TopicExam` stores `last_score`, `last_total`, `attempts` (atomically incremented via `F('attempts') + 1`)
- Course detail GET includes `exam_scores: [{ tag, last_score, last_total, attempts }]`
- Course page surfaces: score badge on each topic pill (green ≥70%, amber 50–69%, red <50%), avg score stat card, "Needs Review" section listing topics <70% sorted worst first

### Transcript Editing & Regeneration

- Transcript tab on LecturePage is editable — PATCH `/api/lectures/:id/` with `{ transcript }`
- After saving, an amber banner prompts to regenerate notes/flashcards from the updated transcript
- Regenerate calls POST `/api/lectures/:id/regenerate/` — replaces title, summary, notes, tags, and all flashcards
- Regenerate prompt disappears once regeneration succeeds (not before)

### PDF Export

- Notes tab has an "Export PDF" button using `usePrintNotes` hook (`frontend/src/usePrintNotes.tsx`)
- Renders notes into a hidden print-only portal, then calls `window.print()` — browser native print-to-PDF
- Print styles hide everything except the notes content

### Anki Export

- `GET /api/lectures/:id/anki/` — exports a lecture's flashcards as a native `.apkg` file
- `GET /api/courses/:id/anki/?tag=` — exports all flashcards for a topic (across all tagged lectures) as `.apkg`; omitting `tag` exports the whole course
- Uses `genanki` with a fixed model ID (`1607392319`) so repeated imports don't create duplicate model definitions in Anki
- Files are served as `application/octet-stream` with `Content-Disposition: attachment`; filenames are sanitised (special chars stripped, spaces → underscores)
- `downloadFile(url, filename)` in `api.ts` handles auth-protected binary downloads: fetches with Bearer token, creates a blob object URL, triggers browser save dialog via a hidden `<a>` click, then revokes the URL
- "Export to Anki" button on the Flashcards tab of both LecturePage and TopicPage; shows "Exporting…" while in flight; errors surfaced via `alert()`

### Global Search

- `GET /api/search/?q=&course_id=` — searches lecture titles, summaries, notes, tags, and flashcard front/back; optional `course_id` scopes results to one course; returns `{ topics, lectures, flashcards }` capped at 6/6/5
- `SearchModal` component (`components/SearchModal.tsx`) — command-palette style overlay, triggered by Cmd+K / Ctrl+K from any protected page or by a search button on CoursesPage and CourseDetailPage
- **Scope chip**: when opened from a course page, a `[Course Name ×]` chip appears in the input; clicking × clears scope to search everywhere
- **Scope toggle**: "This course" / "Everywhere" pill tabs appear when a course context is available
- Richer result cards: lectures show summary snippet; flashcards show `→ back` preview; topics show lecture count
- Course name shown under each result in global mode; hidden when scoped (no noise)
- Empty state in scoped mode offers a one-click "search everywhere" link
- Keyboard navigation: ↑↓ to move, ↵ to open, Esc to close; footer hints only shown when results exist
- `AuthLayoutWrapper` (`components/AuthLayoutWrapper.tsx`) wraps the auth layout `Outlet`; mounts the modal and listens for Cmd+K + `brainjam:search` custom event with optional `{ courseId, courseName }` detail

---

## Key Components

### AudioRecorder.tsx

Two modes toggled by a tab bar:

- **Record** — microphone recording with live timer; mic permission error shown inline
- **Upload audio file** — file picker accepting MP3, WAV, M4A, OGG, FLAC, AAC, WebM, MP4
- On API error, the parent error banner shows _"Your recording is preserved — just try again."_
- `onReset` prop clears the parent's `audioBlob` when user explicitly re-records/changes file
- Callback: `onRecordingComplete(blob, filename)` — filename used so Groq gets the correct extension

### PhotoCapture.tsx

Two separate buttons:

- **Take photo** — `capture="environment"` → opens back camera directly on mobile
- **Upload photo** — no `capture` attribute → opens gallery/file picker on mobile and desktop

### ContextFiles.tsx

- Drag-and-drop style file list with emoji icons, name, size, remove button
- Accepts: `.pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,image/*`

### SearchModal.tsx

- Command-palette overlay triggered by Cmd+K / Ctrl+K or `brainjam:search` custom event
- Accepts optional `courseId` + `courseName` props for course-scoped search
- Scope chip in input row (`[Course Name ×]`) — click × to clear scope and search everywhere
- "This course" / "Everywhere" pill toggle (only shown when course context provided)
- Results grouped into Topics, Lectures, Flashcards sections; each has richer secondary text
- Keyboard navigation: ↑↓ to focus rows, ↵ to navigate, Esc to close; footer hints only render when results exist
- Dispatching `brainjam:search` with `detail: { courseId, courseName }` opens pre-scoped modal

### AuthLayoutWrapper.tsx

- Replaces bare `Outlet` as the `authLayout` component in `routeTree.ts`
- Listens for Cmd+K / Ctrl+K globally and for `brainjam:search` custom events
- Renders `<SearchModal>` with the course context extracted from the event's `detail` field

### UserMenu.tsx

- Avatar circle (first letter of username) + dropdown
- Shows username + email; sign-out button blacklists refresh token then clears localStorage

### ResultsPage save-to-course panel

After generating, a panel appears at the bottom to save the lecture:

- Pick an existing course, select **"Miscellaneous (no course)"**, or create a new one inline (name + color picker)
- "Miscellaneous" calls `GET /api/courses/default/` to find-or-create the catch-all course
- On save: POST `/api/lectures/` with all data; shows "Lecture saved!" + `← Back to course` + `View saved →` links
- **Auto-save on exit**: if the user navigates away without saving, a `keepalive` fetch silently saves to Miscellaneous. `defaultCourseIdRef` is pre-fetched on mount; `savedRef` tracks whether an explicit save happened.

---

## Navigation & UX Design

### RecordPage (`index.tsx`)

- Header row: `← My Courses` link (left) + `UserMenu` (right)
- Title `BrainJam` + subtitle sit below the header row in a separate block

### ResultsPage (`results.tsx`)

- Header: `← Record new` link (goes to `/`) + `My Courses` link (goes to `/courses`)
- After saving: green confirmation row shows `← Back to course` (to `/courses/:id`) and `View saved →` (to `/lectures/:id`)

### CourseDetailPage (`course.tsx`)

- Stats row: Lectures count, Flashcard count, Topics count, Avg score (when exams attempted)
- Topics section: pills with score badges; "Needs Review" section below when any topic <70%
- Delete course: inline confirmation row instead of `confirm()` dialog
- Delete lecture (in `LectureCard`): same inline pattern per-card

### LecturePage (`lecture.tsx`)

- Three tabs: Flashcards, Notes, Transcript
- Notes tab: "Export PDF" + "Copy notes" buttons
- Transcript tab: "Edit" button → textarea; "Save" saves to DB; amber banner prompts regeneration
- Tags: inline edit with suggestions from sibling lectures in the same course
- Delete: inline confirmation row — no `confirm()` dialog
- **Prev / Next lecture navigation**: bottom of card, hidden at first/last lecture

### TopicPage (`topic.tsx`)

- Two tabs: Study (combined notes + flashcards from all tagged lectures) and Exam
- Exam tab: generates or loads cached exam; shows stale warning when lecture set changed since last generation
- Exam flow: questions shown one at a time; MCQ selectable options; numeric/short_answer show model answer after submission; summary screen at end with score and per-question review
- Score submitted to backend on exam completion; course page score badges update

### CoursesPage (`courses.tsx`)

- Empty state copy: _"Welcome to BrainJam! Create your first course to start organising your lectures."_

### Inline delete confirmation pattern

Used in `course.tsx` (both LectureCard and CourseDetailPage) and `lecture.tsx`:

```tsx
const [confirmDelete, setConfirmDelete] = useState(false)

{confirmDelete ? (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500">Are you sure?</span>
    <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
    <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
  </div>
) : (
  <button onClick={() => setConfirmDelete(true)} ...>×</button>
)}
```

No `window.confirm()` dialogs are used anywhere in the app.

---

## Environment Variables

Located at `BrainJam/.env`:

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

### TopicExam Caching

Exams are generated once per (course, tag) pair and cached in the DB. A `lecture_snapshot` (sorted list of lecture PKs at generation time) is stored so the frontend can detect staleness when lectures are added/removed. The stale flag prompts the user to regenerate; they can also use the cached exam as-is.

### ExamQuestion Discriminated Union

`ExamQuestion` in `api.ts` is a TypeScript discriminated union on `type`. `normalizeQuestions()` in `topic.tsx` backfills `type: 'mcq'` on questions from exams generated before the type field was added to the prompt, ensuring backward compatibility.

---

## Known Issues / Past Fixes

- Empty `flashcards: []` from Gemini showed misleading "No results yet" — fixed: guard now distinguishes `state === null` (never generated) vs `state.flashcards.length === 0` (generated but empty); latter shows actionable message
- Gemini `max_output_tokens: 8192` truncated JSON on large PDFs → raised to 65536
- Gemini JSON wrapped in markdown fences or prefixed with thinking text → fixed: regex extraction in `_run_gemini()`
- Audio was required to generate — fixed: audio now optional; photos/PDFs alone can generate a deck
- Short/noisy transcript ("you you you") caused empty flashcard deck — fixed: transcripts < 10 chars fall back to image/context-only Gemini prompt
- `GET /api/courses/default/` must be declared before `GET /api/courses/<int:pk>/` in urls.py or Django will never match it (string "default" won't match int pattern, but order matters for clarity)
- Empty `flashcards: []` from Gemini crashed UI — fixed: guard `!state?.flashcards || state.flashcards.length === 0`
- Gemini rejects PPTX/DOCX as inline bytes — fixed: extract text with `python-pptx` / `python-docx`
- Hardcoded `audio/webm` MIME type broke MP3 uploads to Groq — fixed: MIME detection from header + extension
- `capture="environment"` on PhotoCapture forced camera, no gallery option on mobile — fixed: two separate inputs
- TanStack Router v1 doesn't support route state → module-level store pattern
- Gemini model must be `gemini-2.5-flash` (not 2.0 or 1.5 — not available on this account)
- `load_dotenv` must be called after `BASE_DIR` is defined in settings.py
- `npm run dev` may fail with `ENOSPC: System limit for number of file watchers reached` → use `CHOKIDAR_USEPOLLING=1 npm run dev`
- `Outlet` from TanStack Router v1 is a `React.memo` object (`typeof === 'object'`), not a function — still a valid React component, works as `component: Outlet` in `createRoute`
- `window.confirm()` on mobile is unstyled and blocks the UI — replaced everywhere with inline confirmation pattern
- `course.lectures.filter(tags__contains=[tag])` JSONField lookup fails on older SQLite — fixed: Python-level filter `[l for l in course.lectures.all() if tag in (l.tags or [])]`
- Cached exams with no `type` field (generated before question types were added) rendered blank — fixed: `normalizeQuestions()` defaults missing `type` to `'mcq'`
- Regenerate alert appeared immediately after transcript save (before user clicked Regenerate) — fixed: conditional rendering gates the amber banner on `updateTranscript.isSuccess && !editingTranscript && !regenerate.isSuccess`
- `usePrintNotes` opened a new blank tab — fixed: portal renders into `document.body`, `window.print()` called directly; no new tab needed

---

## Session 3: Multi-Audio Support & Large File Handling (March 26, 2026)

### Problem Statement
- Users wanted to upload multiple lecture audio files in one go
- Large context uploads (50MB+) + multiple audios caused "malformed JSON" errors from Gemini
- Need to handle arbitrary amounts of user-uploaded content without data loss

### Changes Made

#### Frontend: AudioRecorder.tsx (Major Refactor)
**New interface:**
- `audioFiles: Array<{blob: Blob, filename: string}>` (controlled component from parent)
- `onAdd(blob, filename)` — add audio item to list
- `onRemove(index)` — remove audio item from list
- **Record tab:** Records sequentially; on stop, adds to list (auto-numbered: `recording-1.webm`, `recording-2.webm`, etc.) and resets UI
- **Upload tab:** File input with `multiple` support; each selected file triggers `onAdd`
- **Audio files list:** Always visible below tabs; shows all added audio with remove buttons
- **Tab switching:** Pause-on-switch behaviour preserved (if user records, switches to upload tab, the recording is paused, not lost)

#### Frontend: ContextFiles.tsx (Minor Update)
- Audio file extensions now accepted: `.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm`
- Added 🎵 icon for audio files
- Updated hint text: "Supports PDF, DOCX, PPTX, TXT, audio files (MP3, WAV, etc), images — any course material"

#### Frontend: RecordPage (index.tsx) (State & Processing Refactor)
**State:**
- `audioBlob: Blob | null` → `audioFiles: Array<{blob: Blob, filename: string}>`
- `audioFilename` removed (now stored per-file in array)
- Added `currentAudioIndex` to track progress during multi-file processing

**Processing:** Smart request batching to handle large uploads
- **First audio file:** Sent WITH all photos + all context files (comprehensive request)
- **Subsequent audio files:** Sent WITH only photos (lightweight requests)
- Rationale: Context files apply to the whole lecture; distributing them prevents any single request from becoming too large

**Result combination function:**
```ts
function combineResults(results: Array<any>) {
  // Concatenate transcripts with "Part 1 — filename.mp3" / "Part 2 — filename2.mp3" labels
  // Merge flashcards (no dedup)
  // Section notes with headers: ## Part 1 — filename / [notes] / --- / ## Part 2 — filename / [notes]
  // Union tags (deduplicated)
  // Join titles with ' · ' separator (e.g., "Neural Networks · Backpropagation")
  // Combine summaries: "Part 1: {summary1} Part 2: {summary2}"
}
```

**Loading UI:** Shows "Processing audio X of N…" when multiple files are being processed

#### Backend: views.py (API Robustness)

**1. Increased Gemini output token limit:**
- `max_output_tokens: 65536` → `max_output_tokens: 150000`
- Allows Gemini to output comprehensive results for large/complex inputs without truncation

**2. Intelligent malformed JSON error recovery:**
Enhanced `_extract_json()` with multiple fallback strategies:
- **Primary:** Standard `json.loads()`
- **Fallback 1:** Remove trailing commas (common Gemini artifact)
- **Fallback 2:** Regex-based field extraction to reconstruct JSON from expected fields (title, summary, notes, flashcards, tags, transcript)
- If all strategies fail, raises informative error with fallback attempt details

Benefits: Even if Gemini returns incomplete or slightly malformed JSON, the backend recovers gracefully and extracts the key fields needed.

### Testing Notes

**Single audio file:**
- Record or upload 1 audio → generate → works as before

**Multiple audio files:**
- Upload 2× 25MB lectures + 50MB+ context files → system now handles it:
  - First request: 25MB audio + photos + 50MB context
  - Second request: 25MB audio + photos (no context)
  - Results combine with clear "Part 1" / "Part 2" boundaries

**Error recovery:**
- If Gemini returns malformed JSON, backend logs multiple fallback attempts and recovers by extracting expected fields

### Known Limitations / Future Improvements
- Context files are only sent with the first audio file (by design, to keep requests manageable)
- No per-audio-file context file assignment (all context applies globally)
- Results are combined at generation time; no post-hoc re-ordering of parts

---

## Out of Scope

- React Native mobile app (planned post-hackathon)
- Real-time transcription
- Audio chunking for files >25 MB
- Password reset / email verification
