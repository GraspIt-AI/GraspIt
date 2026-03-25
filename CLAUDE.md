# BrainJam — Project Context

## What is BrainJam?

BrainJam is a lecture-to-study-materials web app built for a hackathon. Students record a lecture audio and optionally snap photos of whiteboards/slides. The app automatically generates flashcards and structured notes from the combined audio + images, so students can focus entirely on the lecture rather than taking notes.

**Hackathon deadline:** Thursday March 27, 2026 — midday presentation.

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
├── .env                       ← GROQ_API_KEY, GEMINI_API_KEY (do NOT commit)
├── frontend/                  ← Vite + React
│   ├── vite.config.ts         ← Tailwind plugin + proxy /api → localhost:8000
│   ├── src/
│   │   ├── index.css          ← @import "tailwindcss"; @plugin "@tailwindcss/typography"
│   │   ├── main.tsx           ← RouterProvider + QueryClientProvider; window.__test() dev helper
│   │   ├── routeTree.ts       ← TanStack Router route definitions
│   │   ├── store.ts           ← Module-level store (setResults/getResults) to pass data between routes
│   │   ├── routes/
│   │   │   ├── index.tsx      ← RecordPage: audio recorder + photo capture + generate button
│   │   │   └── results.tsx    ← ResultsPage: flashcard viewer + notes viewer
│   │   └── components/
│   │       ├── AudioRecorder.tsx   ← MediaRecorder start/stop/pause, webm blob
│   │       ├── PhotoCapture.tsx    ← File input with image/* + camera capture, thumbnails
│   │       ├── FlashCard.tsx       ← CSS 3D flip card animation
│   │       └── NotesViewer.tsx     ← react-markdown with prose/typography classes
│   └── package.json
│
└── backend/
    └── brainjam/
        ├── manage.py
        ├── brainjam/
        │   ├── settings.py    ← loads .env, adds corsheaders, DRF, api app
        │   └── urls.py        ← includes api.urls at /api/
        └── api/
            ├── urls.py        ← POST /api/process/
            └── views.py       ← main pipeline: Groq transcription → Gemini generation
```

---

## API Pipeline

```
POST /api/process/  (multipart/form-data)
  Fields:
    audio   — webm audio blob from MediaRecorder
    images  — (optional) one or more image files

Steps:
  1. Groq Whisper large-v3 → transcript text
  2. Gemini 2.5 Flash (with optional images) → JSON {flashcards, notes}

Response:
  {
    "flashcards": [{"front": "...", "back": "..."}],
    "notes": "## Markdown string..."
  }
```

---

## Environment Variables

Located at `/home/enrikkk/Desktop/Computer Science/BrainJam/.env`:
```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
```

Django settings load this via `python-dotenv` at startup.

---

## Running Locally

**Backend:**
```bash
cd backend
source venv/bin/activate
cd brainjam
python manage.py runserver
# Runs on http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
# /api/* requests are proxied to http://localhost:8000
```

---

## Key Architecture Decisions

### Module-Level Store (store.ts)
TanStack Router v1 does not support passing state between routes the same way React Router does. We use a simple module-level variable (`let results`) with `setResults()`/`getResults()` to pass data from RecordPage to ResultsPage after a successful API call.

### Groq Instead of OpenAI Whisper
Using Groq's Whisper API (OpenAI-compatible endpoint at `https://api.groq.com/openai/v1`). It's free for students and has very fast transcription. Accepts `audio/webm` format directly from the browser's MediaRecorder.

### Gemini Instead of Anthropic Claude
Using Google Gemini 2.5 Flash for generation + vision because it's free via API key. The model handles both vision (board photos) and structured JSON generation in a single call. Model ID: `gemini-2.5-flash` (not `gemini-2.0-flash` or `gemini-1.5-flash` — those aren't available on this account).

### google-genai Package
Use `from google import genai` (`google-genai` package). Do NOT use `google-generativeai` (deprecated).

---

## What's Working (as of March 24, 2026)

- [x] Full frontend UI: audio recording, photo capture, flashcard flip, notes viewer
- [x] Backend API endpoint receiving multipart audio + images
- [x] Groq Whisper transcription of webm audio
- [x] Gemini 2.5 Flash generating flashcards + markdown notes from transcript
- [x] End-to-end flow: record → generate → view flashcards + notes
- [x] Tailwind typography plugin for styled markdown notes
- [x] Dev helper: `window.__test(data)` in browser console injects fake data for testing

## Known Issues / Recent Fixes

- Empty `flashcards: []` from Gemini (when transcript is empty) used to crash the UI — fixed by guarding for empty array in `results.tsx`
- Force `audio/webm` as content-type when sending to Groq (browser sometimes sends `audio/webm;codecs=opus` which some APIs reject)
- Empty transcript now returns a user-friendly error instead of sending empty text to Gemini

---

## Out of Scope for Hackathon MVP

- User accounts / authentication
- Persistent storage (results live in memory)
- React Native mobile app (planned for post-hackathon)
- Export to Anki/PDF
- Real-time transcription
- Audio chunking for files >25 MB

---

## Future: React Native Mobile App

After the hackathon, the plan is to build a React Native version using the same Django backend. The mobile app would use the device microphone + camera natively instead of the browser's MediaRecorder API.
