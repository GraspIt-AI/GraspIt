# BrainJam — 3-Agent Work Division Plan
**Deadline: Tomorrow March 26, 2026 at 4pm**

---

## Context

BrainJam is a hackathon web app that records lecture audio + optional whiteboard photos, transcribes via Groq Whisper large-v3, then generates flashcards + markdown notes via Gemini 2.5 Flash. The core pipeline is fully working. What remains is polish, UX improvements, and a few high-impact features before the Thursday March 27 midday presentation.

**Stack:**
- Frontend: React + Vite + TanStack Router v1 + Tailwind CSS v4 (`frontend/`)
- Backend: Django + DRF (`backend/brainjam/`)
- Transcription: Groq Whisper large-v3 (OpenAI-compatible client, free)
- Generation: Google Gemini 2.5 Flash (`from google import genai`, model: `gemini-2.5-flash`, free)

**Running locally:**
```bash
# Backend
cd backend && source venv/bin/activate && cd brainjam && python manage.py runserver
# Frontend (separate terminal)
cd frontend && npm run dev
```

**Key architecture note:** TanStack Router v1 has no built-in cross-route state. Results are passed from RecordPage → ResultsPage via a module-level store in `frontend/src/store.ts` using `setResults()` / `getResults()`.

**Current API contract — `POST /api/process/`:**
- Request: `multipart/form-data` with `audio` (webm blob) and optional `images`
- Current response: `{ flashcards: [{front, back}], notes: "markdown" }`
- After Agent 3's work: `{ flashcards: [...], notes: "...", transcript: "..." }`

**Repo:** https://github.com/Enrikkk/BrainJam (private)

**Dev helper:** In the browser console on the results page, run:
```js
window.__test({
  flashcards: [{front: "What is a neuron?", back: "A cell that transmits signals."}],
  notes: "## Neuroscience\n\n- Neurons transmit signals",
  transcript: "Today we will talk about neurons..."
})
```

---

## File Ownership — Strict, No Overlaps

| File | Owner |
|---|---|
| `frontend/src/routes/index.tsx` | **Agent 1** |
| `frontend/src/components/AudioRecorder.tsx` | **Agent 1** |
| `frontend/src/components/PhotoCapture.tsx` | **Agent 1** |
| `frontend/src/routes/results.tsx` | **Agent 2** |
| `frontend/src/components/FlashCard.tsx` | **Agent 2** |
| `frontend/src/components/NotesViewer.tsx` | **Agent 2** |
| `frontend/src/store.ts` | **Agent 2** |
| `backend/brainjam/api/views.py` | **Agent 3** |
| `backend/brainjam/brainjam/settings.py` | **Agent 3** |

---

## Agent 1 — RecordPage & Input UX

**Branch:** `feature/agent1-record-ux`
**Files:** `frontend/src/routes/index.tsx`, `frontend/src/components/AudioRecorder.tsx`, `frontend/src/components/PhotoCapture.tsx`

### Tasks (priority order)

**1.1 — Multi-step loading indicator (CRITICAL — #1 UX win)**
The app currently looks frozen during the ~30s API call. Replace the boolean `loading` state in `index.tsx` with a step union:
```ts
type LoadingStep = 'idle' | 'uploading' | 'transcribing' | 'generating'
const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle')
```
Since the backend is a single synchronous call, use time-based `setTimeout` transitions: `'uploading'` on fetch start, `'transcribing'` after ~2s, `'generating'` after ~10s. Cancel timers on completion/error. Render a 3-step progress UI: `[✓] Uploading → [●] Transcribing → [ ] Generating flashcards`.

**1.2 — Cancel button during generation**
Add an `AbortController` ref. Pass its `signal` to `fetch()`. Show a "Cancel" button when `loadingStep !== 'idle'`. On cancel, abort the request, reset state, show a neutral message. Handle `AbortError` separately so it does not show a red error banner.

**1.3 — Microphone permission error in AudioRecorder**
`startRecording()` currently has no error handling. Wrap in try/catch, detect `NotAllowedError`, set an `'error'` state in the component showing: "Microphone access denied. Please allow microphone access in your browser settings and reload the page."

Add `onReset?: () => void` prop to `AudioRecorder.tsx` and call it from the existing `reset()` function. In `index.tsx`, pass `onReset={() => setError(null)}` so the red error banner clears when the user re-records.

**1.4 — Mobile layout polish**
Ensure the RecordPage card does not overflow at ~375px. Check button text does not truncate during loading states.

---

## Agent 2 — ResultsPage, FlashCard, NotesViewer, Store

**Branch:** `feature/agent2-results-polish`
**Files:** `frontend/src/routes/results.tsx`, `frontend/src/components/FlashCard.tsx`, `frontend/src/components/NotesViewer.tsx`, `frontend/src/store.ts`

### Tasks (priority order)

**2.1 — Add `transcript` field to store**
In `store.ts`, add `transcript: string` to `LectureResults`:
```ts
export interface LectureResults {
  flashcards: Flashcard[]
  notes: string
  transcript: string
}
```
Non-breaking — `index.tsx` already does `setResults(data)` and the API response will carry the new field once Agent 3 merges.

**2.2 — Transcript tab on ResultsPage**
Add a third tab `'transcript'` in `results.tsx`. Render the raw transcript in a scrollable pre-formatted box:
```tsx
<div className="bg-gray-50 rounded-2xl p-5 max-h-96 overflow-y-auto">
  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
    {state.transcript}
  </p>
</div>
```
**Guard:** only render the Transcript tab button if `state.transcript` exists — graceful degradation if Agent 3 hasn't merged yet.

**2.3 — Keyboard navigation for flashcards**
Add a `keydown` `useEffect` in `results.tsx`, active only when `tab === 'flashcards'`:
- `ArrowRight`/`ArrowDown` → next card
- `ArrowLeft`/`ArrowUp` → prev card
- `Space`/`Enter` → flip card

Upgrade `FlashCard.tsx` with optional controlled mode:
```ts
interface Props {
  front: string; back: string; index: number; total: number
  flipped?: boolean    // optional controlled
  onFlip?: () => void  // optional controlled
}
```
If `flipped !== undefined`, use the prop + call `onFlip` on click; otherwise keep existing `useState` uncontrolled logic. In `results.tsx`, manage `cardFlipped` state and reset to `false` when navigating to a new card.

**2.4 — Copy-to-clipboard for notes**
In `results.tsx`, show a small "Copy notes" button in the notes panel. On click: `navigator.clipboard.writeText(notes)`, briefly show "Copied!" for 2s using local state.

**2.5 — Flashcard text overflow**
In `FlashCard.tsx`, add `overflow-y-auto max-h-60` to both face divs, change front face from `text-lg` to `text-base`.

**2.6 — Polished empty state**
Replace "No results yet." with a card-style placeholder that has an icon and subtitle: "Generate flashcards from a recorded lecture to see them here."

---

## Agent 3 — Backend: Transcript, Quality, Robustness

**Branch:** `feature/agent3-backend`
**Files:** `backend/brainjam/api/views.py`, `backend/brainjam/brainjam/settings.py`

### Tasks (priority order)

**3.1 — Return transcript in API response (CRITICAL — unlocks Agent 2's tab)**
In `views.py`, before `return Response(result)`:
```python
result['transcript'] = transcript
return Response(result)
```
**Merge this PR first** so Agent 2 can test the transcript tab end-to-end.

**3.2 — Request timeouts**
- Groq: pass `timeout=30.0` to `OpenAI(...)` constructor
- Gemini: wrap `generate_content` call in `concurrent.futures.ThreadPoolExecutor`, use `future.result(timeout=60)`, return HTTP 504 on `TimeoutError`

**3.3 — Improve Gemini prompt**
Enhance `system_prompt` for better output quality:
- Prefer concept-understanding questions over trivia
- Request H2 sections + bullet points + **bold key terms** in notes
- Add a short "## Key Takeaways" section at the top of notes
- Deduplicate overlapping flashcard topics
- Always create flashcards for equations, formulas, definitions
- **Do not change the JSON-only output instruction** (parser depends on it)

**3.4 — 413 handler for oversized audio**
In `views.py`, after the `if not audio_file:` check:
```python
if audio_file.size and audio_file.size > 25 * 1024 * 1024:
    return Response({'error': 'Audio file too large (max 25 MB). Please record in shorter segments.'}, status=413)
```

**3.5 — Increase Gemini output capacity**
Change `max_output_tokens` from `4096` to `8192` and add `temperature=0.4`.

---

## Coordination Protocol

### Merge Order
1. **Agent 3** merges `feature/agent3-backend` first → adds `transcript` to API response
2. **Agent 2** merges `feature/agent2-results-polish` second → transcript tab works end-to-end
3. **Agent 1** merges `feature/agent1-record-ux` any time → fully independent

All branches cut from current `main`. Never branch from another agent's branch.

### Timeline
- **T+0:** All three pull `main`, create their branches, start work
- **T+3h:** Agent 3 pushes Task 3.1 (transcript in response) so Agent 2 can pull and test locally
- **T+7h:** All tasks done, PRs open for review
- **T+9h:** All PRs merged to `main`, integration test
- **T+10h:** Buffer for fixes + demo prep

---

## Testing Checklist

### Agent 1 Self-Test
- [ ] Mic permission denied → shows friendly error message, no crash
- [ ] Generate → step indicator cycles: Uploading → Transcribing → Generating
- [ ] Cancel mid-request → neutral message, no red error, re-record works immediately
- [ ] Error then re-record → red error banner clears
- [ ] Layout at 375px width → no horizontal overflow

### Agent 2 Self-Test (use `window.__test({...})` in console)
- [ ] Three tabs visible: Flashcards, Notes, Transcript
- [ ] Transcript tab shows scrollable raw text
- [ ] If `transcript` missing from data → Transcript tab hidden, no crash
- [ ] Arrow keys navigate flashcards, Space/Enter flips
- [ ] Navigating to new card resets flip to front
- [ ] Copy notes → clipboard + "Copied!" flash
- [ ] Long flashcard text contained within card bounds (no overflow)
- [ ] Empty state (no store data) shows polished placeholder with icon

### Agent 3 Self-Test
- [ ] API response includes `"transcript": "..."` field
- [ ] Audio > 25MB → 413 with clear error message
- [ ] Groq timeout → 502 with readable error (not 500 traceback)
- [ ] Gemini timeout → 504 with readable error
- [ ] Gemini output has H2 headers, bold terms, Key Takeaways section
- [ ] `max_output_tokens` is 8192, `temperature` is 0.4

### Integration Test (all together after merging to main)
- [ ] Full end-to-end: record 2-min lecture → all 3 tabs visible (Flashcards, Notes, Transcript)
- [ ] Keyboard navigation works on ResultsPage
- [ ] Step indicator cycles correctly during real API call
- [ ] Cancel and re-record immediately → no stuck state
- [ ] Copy notes works
- [ ] No console errors during normal flow

---

## Summary

| Agent | Branch | Key Deliverable | Est. Hours |
|---|---|---|---|
| **Agent 1** | `feature/agent1-record-ux` | Loading step indicator, cancel button, mic error, mobile polish | 6–8h |
| **Agent 2** | `feature/agent2-results-polish` | Transcript tab, keyboard nav, copy notes, overflow fix, empty state | 6–8h |
| **Agent 3** | `feature/agent3-backend` | Transcript in response, timeouts, improved Gemini prompt | 4–6h |

Agent 3 has the lightest load — use spare time to review the other two PRs and prepare the demo script.
