# BrainJam — Project Context

## What is BrainJam?

BrainJam is a lecture-to-study-materials web app built for a hackathon. Students record a lecture audio, optionally snap photos of whiteboards/slides, and optionally attach context files (PDFs, slides, notes). The app automatically generates flashcards, structured notes, a title, and a summary.

**Hackathon deadline:** Thursday March 27, 2026 — midday presentation.
**Repo:** https://github.com/Enrikkk/BrainJam (private)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TanStack Router + TanStack Query + Tailwind CSS v4 |
| Backend | Django + Django REST Framework |
| Transcription | Groq Whisper large-v3 (free, OpenAI-compatible API) |
| Generation + Vision | Google Gemini 2.5 Flash (`gemini-2.5-flash`) |
| Styling | Tailwind CSS v4 with `@tailwindcss/typography` |

---

## Project Structure

```
BrainJam/
├── CLAUDE.md                  ← you are here
├── PLAN.md                    ← original 3-agent work division plan
├── .env                       ← GROQ_API_KEY, GEMINI_API_KEY (do NOT commit)
├── frontend/
│   ├── vite.config.ts         ← Tailwind plugin + proxy /api → localhost:8000
│   ├── src/
│   │   ├── index.css          ← @import "tailwindcss"; @plugin "@tailwindcss/typography"
│   │   ├── main.tsx           ← RouterProvider + QueryClientProvider; window.__test() dev helper
│   │   ├── routeTree.ts       ← TanStack Router route definitions
│   │   ├── store.ts           ← Module-level store (setResults/getResults)
│   │   ├── routes/
│   │   │   ├── index.tsx      ← RecordPage (4 steps: record, photos, context files, generate)
│   │   │   └── results.tsx    ← ResultsPage (flashcards, notes, transcript tabs)
│   │   └── components/
│   │       ├── AudioRecorder.tsx
│   │       ├── PhotoCapture.tsx
│   │       ├── ContextFiles.tsx   ← NEW: arbitrary file uploads (PDF, DOCX, PPTX, TXT, images)
│   │       ├── FlashCard.tsx
│   │       └── NotesViewer.tsx
│   └── package.json
└── backend/
    └── brainjam/
        ├── manage.py
        ├── brainjam/
        │   ├── settings.py
        │   └── urls.py
        └── api/
            ├── urls.py        ← POST /api/process/
            └── views.py       ← main pipeline
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

There is also a **"Load demo data"** button at the bottom of the RecordPage — click it to load a sample photosynthesis lecture without recording anything. Useful for demo day.

---

## API Pipeline

```
POST /api/process/  (multipart/form-data)
  Fields:
    audio   — webm audio blob from MediaRecorder
    images  — (optional) one or more whiteboard/slide image files
    files   — (optional) one or more context files (PDF, DOCX, PPTX, TXT, images, etc.)

Steps:
  1. Groq Whisper large-v3 → transcript text (30s timeout)
  2. Gemini 2.5 Flash (with optional images + context files) → JSON  (60s timeout)

Response:
  {
    "title": "Short Lecture Title",
    "summary": "1-2 sentence overview of what was covered.",
    "flashcards": [{"front": "...", "back": "..."}],
    "notes": "## Key Takeaways\n...",
    "transcript": "raw transcript text..."
  }
```

**Context file handling in views.py:**
- Images → PIL Image (same as board photos)
- PDFs → `types.Part.from_bytes(data, mime_type='application/pdf')` inline to Gemini
- Text files (TXT, MD) → read as UTF-8 string, appended to prompt
- Other (DOCX, PPTX, etc.) → attempted as `types.Part.from_bytes` with detected mime type; silently skipped on error

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
TanStack Router v1 does not support passing state between routes. We use a simple module-level variable with `setResults()`/`getResults()` to pass data from RecordPage to ResultsPage.

### Groq Instead of OpenAI Whisper
Free for students. OpenAI-compatible endpoint at `https://api.groq.com/openai/v1`. Force `audio/webm` content-type (not `audio/webm;codecs=opus`).

### Gemini 2.5 Flash
Free via API key. Model ID: `gemini-2.5-flash`. Use `from google import genai` (`google-genai` package). Do NOT use `google-generativeai` (deprecated). Gemini timeout wrapped in `concurrent.futures.ThreadPoolExecutor`.

---

## Current State (as of March 26, 2026) — ALL MERGED TO MAIN

### ✅ Agent 3 — Backend (`backend/brainjam/api/views.py`)
- `transcript`, `title`, `summary` fields returned in API response
- Groq 30s timeout, Gemini 60s timeout via ThreadPoolExecutor
- Improved Gemini prompt: Key Takeaways, bold terms, concept-based questions, dedup, equations
- `max_output_tokens=8192`, `temperature=0.4`
- 413 response for audio > 25MB
- Empty transcript → 422 with friendly message
- Context files accepted via `files` form field (PDF inline, text as string, images via PIL)

### ✅ Agent 1 — RecordPage (`frontend/src/routes/index.tsx`, `AudioRecorder.tsx`)
- `LoadingStep` union: `'idle' | 'uploading' | 'transcribing' | 'generating'`
- 3-step visual progress indicator with checkmarks and pulse animation
- AbortController cancel button during generation
- Microphone permission denied → `'error'` state with friendly message
- `onReset` prop clears parent error banner on re-record
- Mobile layout fixes

### ✅ Agent 2 — ResultsPage (`frontend/src/routes/results.tsx`, `FlashCard.tsx`, `store.ts`)
- 3 tabs: Flashcards, Notes, Transcript (transcript tab hidden if no data)
- Keyboard navigation: `←/→` prev/next card, `Space/Enter` flip
- Flip resets to front when navigating to new card
- Copy notes to clipboard with "Copied!" flash
- Flashcard text overflow fix (`max-h-60 overflow-y-auto`)
- Polished empty state with graduation cap icon and CTA

### ✅ Extra Features (all merged to main)
- **Context file uploads** — Step 3 on RecordPage; `ContextFiles.tsx` component; supports PDF, DOCX, PPTX, TXT, images
- **Title + Summary** — Gemini generates a descriptive title and 1-2 sentence summary; shown as page heading on ResultsPage
- **Demo button** — "Load demo data" link on RecordPage loads photosynthesis sample without recording
- **`store.ts`** — `LectureResults` now has `title?: string` and `summary?: string`

---

## Known Issues / Past Fixes

- Empty `flashcards: []` from Gemini crashed UI — fixed: `!state?.flashcards || state.flashcards.length === 0`
- Force `audio/webm` content-type to Groq (browser sends `audio/webm;codecs=opus`)
- TanStack Router v1 doesn't support route state → module-level store pattern
- Gemini model must be `gemini-2.5-flash` (not 2.0 or 1.5 — not available on this account)
- `load_dotenv` must be called after `BASE_DIR` is defined in settings.py
- `npm run dev` may fail with `ENOSPC: System limit for number of file watchers reached` → use `CHOKIDAR_USEPOLLING=1 npm run dev`

---

## Out of Scope for Hackathon MVP

- User accounts / authentication
- Persistent storage
- React Native mobile app (planned post-hackathon)
- Export to Anki/PDF
- Real-time transcription
- Audio chunking for files >25 MB
