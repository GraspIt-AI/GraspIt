# BrainJam — Project Context

## What is BrainJam?

BrainJam is a lecture-to-study-materials web app built for a hackathon. Students record a lecture audio and optionally snap photos of whiteboards/slides. The app automatically generates flashcards and structured notes from the combined audio + images.

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
├── PLAN.md                    ← 3-agent work division plan
├── .env                       ← GROQ_API_KEY, GEMINI_API_KEY (do NOT commit)
├── frontend/
│   ├── vite.config.ts         ← Tailwind plugin + proxy /api → localhost:8000
│   ├── src/
│   │   ├── index.css          ← @import "tailwindcss"; @plugin "@tailwindcss/typography"
│   │   ├── main.tsx           ← RouterProvider + QueryClientProvider; window.__test() dev helper
│   │   ├── routeTree.ts       ← TanStack Router route definitions
│   │   ├── store.ts           ← Module-level store (setResults/getResults)
│   │   ├── routes/
│   │   │   ├── index.tsx      ← RecordPage
│   │   │   └── results.tsx    ← ResultsPage
│   │   └── components/
│   │       ├── AudioRecorder.tsx
│   │       ├── PhotoCapture.tsx
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
cd frontend && npm run dev
# Runs on http://localhost:5173
# /api/* proxied to http://localhost:8000
```

**Dev test helper** (browser console on any page):
```js
window.__test({
  flashcards: [{front: "What is a neuron?", back: "A cell that transmits signals."}],
  notes: "## Key Takeaways\n\n- Neurons transmit signals\n\n## Neurons\n\n- **Neurons** are cells",
  transcript: "Today we will talk about neurons and the nervous system..."
})
```

---

## API Pipeline

```
POST /api/process/  (multipart/form-data)
  Fields:
    audio   — webm audio blob from MediaRecorder
    images  — (optional) one or more image files

Steps:
  1. Groq Whisper large-v3 → transcript text (30s timeout)
  2. Gemini 2.5 Flash (with optional images) → JSON {flashcards, notes}  (60s timeout)

Response:
  {
    "flashcards": [{"front": "...", "back": "..."}],
    "notes": "## Key Takeaways\n...",
    "transcript": "raw transcript text..."
  }
```

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

## Current State (as of March 26, 2026)

### ✅ Merged to main

**Agent 3 — Backend** (`backend/brainjam/api/views.py`):
- `transcript` field returned in API response
- Groq 30s timeout, Gemini 60s timeout via ThreadPoolExecutor
- Improved Gemini prompt: Key Takeaways section, bold terms, concept-based questions, dedup
- `max_output_tokens=8192`, `temperature=0.4`
- 413 response for audio > 25MB
- Empty transcript → 422 with friendly message

**Agent 1 — RecordPage** (`frontend/src/routes/index.tsx`, `frontend/src/components/AudioRecorder.tsx`):
- `LoadingStep` union type: `'idle' | 'uploading' | 'transcribing' | 'generating'`
- 3-step visual progress indicator with checkmarks and pulse animation
- AbortController cancel button during generation
- Microphone permission denied → `'error'` state in AudioRecorder with friendly message
- `onReset` prop clears parent error banner on re-record
- Mobile layout fixes (padding, text truncation)

### ⏳ In Progress

**Agent 2 — ResultsPage** (`feature/agent2-results-polish` branch, not yet pushed to remote):
- Transcript tab (3rd tab showing raw Whisper output)
- Keyboard navigation (arrow keys prev/next, Space/Enter to flip)
- Copy notes to clipboard
- Flashcard text overflow fix
- Polished empty state
- `store.ts` update: add `transcript: string` to `LectureResults`

### 🔜 Next (planned, not yet started)
- Add `title` + `summary` fields to Gemini response (backend)
- "Load demo" button on RecordPage for fallback during live demo (frontend)

---

## File Ownership (for parallel work — no conflicts)

| File | Owner | Status |
|---|---|---|
| `frontend/src/routes/index.tsx` | Agent 1 | ✅ Merged |
| `frontend/src/components/AudioRecorder.tsx` | Agent 1 | ✅ Merged |
| `frontend/src/components/PhotoCapture.tsx` | Agent 1 | ✅ Merged |
| `frontend/src/routes/results.tsx` | Agent 2 | ⏳ In progress |
| `frontend/src/components/FlashCard.tsx` | Agent 2 | ⏳ In progress |
| `frontend/src/components/NotesViewer.tsx` | Agent 2 | ⏳ In progress |
| `frontend/src/store.ts` | Agent 2 | ⏳ In progress |
| `backend/brainjam/api/views.py` | Agent 3 | ✅ Merged |
| `backend/brainjam/brainjam/settings.py` | Agent 3 | ✅ Merged |

---

## Merge Order
1. ✅ Agent 3 merged first (transcript in response)
2. ✅ Agent 1 merged (independent)
3. ⏳ Agent 2 merges next — then integration test

---

## Known Issues / Past Fixes

- Empty `flashcards: []` from Gemini crashed UI — fixed in `results.tsx`: `!state?.flashcards || state.flashcards.length === 0`
- Force `audio/webm` content-type to Groq (browser sends `audio/webm;codecs=opus`)
- TanStack Router v1 doesn't support route state → module-level store pattern
- Gemini model must be `gemini-2.5-flash` (not 2.0 or 1.5 — not available on this account)
- `load_dotenv` must be called after `BASE_DIR` is defined in settings.py

---

## Out of Scope for Hackathon MVP

- User accounts / authentication
- Persistent storage
- React Native mobile app (planned post-hackathon)
- Export to Anki/PDF
- Real-time transcription
- Audio chunking for files >25 MB
