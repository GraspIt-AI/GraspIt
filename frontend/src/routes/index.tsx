import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import AudioRecorder from '../components/AudioRecorder'
import PhotoCapture from '../components/PhotoCapture'
import ContextFiles from '../components/ContextFiles'
import { setResults } from '../store'

type LoadingStep = 'idle' | 'uploading' | 'transcribing' | 'generating'

const STEP_LABELS: Record<Exclude<LoadingStep, 'idle'>, string> = {
  uploading: 'Uploading audio',
  transcribing: 'Transcribing',
  generating: 'Generating flashcards',
}

const STEPS: Exclude<LoadingStep, 'idle'>[] = ['uploading', 'transcribing', 'generating']

export default function RecordPage() {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [contextFiles, setContextFiles] = useState<File[]>([])
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const navigate = useNavigate()
  const abortRef = useRef<AbortController | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const isLoading = loadingStep !== 'idle'

  function clearTimers() {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  function addPhotos(files: File[]) {
    setPhotos((prev) => [...prev, ...files])
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function addContextFiles(files: File[]) {
    setContextFiles((prev) => [...prev, ...files])
  }

  function removeContextFile(index: number) {
    setContextFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function handleLoadDemo() {
    setResults({
      title: 'Introduction to Photosynthesis',
      summary: 'This lecture covers how plants convert light energy into chemical energy through photosynthesis, including the light-dependent reactions and the Calvin cycle.',
      flashcards: [
        { front: 'What is photosynthesis?', back: 'The process by which plants convert sunlight, CO₂, and water into glucose and oxygen.' },
        { front: 'What is the overall equation for photosynthesis?', back: '6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂' },
        { front: 'Where does photosynthesis take place?', back: 'In chloroplasts, specifically the thylakoid membrane (light reactions) and stroma (Calvin cycle).' },
        { front: 'What are the two main stages of photosynthesis?', back: '1. Light-dependent reactions (in thylakoids) — produce ATP & NADPH\n2. Calvin cycle (in stroma) — fixes CO₂ into glucose.' },
        { front: 'What is chlorophyll?', back: 'The green pigment in chloroplasts that absorbs light energy (mainly red and blue wavelengths) to drive photosynthesis.' },
        { front: 'What is the Calvin cycle?', back: 'The light-independent reactions in the stroma that use ATP and NADPH to fix CO₂ into G3P, a precursor to glucose.' },
      ],
      notes: '## Key Takeaways\n\n- Photosynthesis converts **light energy** into **chemical energy** stored as glucose\n- Takes place in **chloroplasts** — thylakoids for light reactions, stroma for Calvin cycle\n- Requires CO₂, H₂O, and sunlight; produces glucose and O₂\n- Two main stages: **light-dependent reactions** and the **Calvin cycle**\n- **Chlorophyll** absorbs red/blue light and reflects green\n\n## Light-Dependent Reactions\n\n- Occur in the **thylakoid membrane**\n- Water molecules are split (**photolysis**), releasing O₂\n- Light energy drives production of **ATP** and **NADPH**\n- These energy carriers power the Calvin cycle\n\n## Calvin Cycle\n\n- Occurs in the **stroma**\n- Uses ATP, NADPH, and CO₂\n- Produces **G3P** (glyceraldehyde-3-phosphate) — precursor to glucose\n- 3 turns of the cycle fix 3 CO₂ to produce 1 G3P',
      transcript: 'Today we\'re going to talk about photosynthesis, which is the process by which plants use sunlight to synthesize food from carbon dioxide and water. The overall equation is 6CO2 plus 6H2O plus light energy yields C6H12O6 plus 6O2. This all happens inside chloroplasts. There are two main stages: the light-dependent reactions, which happen in the thylakoid membrane and produce ATP and NADPH, and the Calvin cycle, which takes place in the stroma and uses those energy carriers to fix carbon dioxide into glucose.',
    })
    navigate({ to: '/results' })
  }

  function handleCancel() {
    abortRef.current?.abort()
    clearTimers()
    setLoadingStep('idle')
    setCancelled(true)
    setTimeout(() => setCancelled(false), 3000)
  }

  async function handleGenerate() {
    if (!audioBlob) return
    setError(null)
    setCancelled(false)
    setLoadingStep('uploading')

    // Time-based step progression (backend is a single synchronous call)
    timersRef.current.push(setTimeout(() => setLoadingStep('transcribing'), 2000))
    timersRef.current.push(setTimeout(() => setLoadingStep('generating'), 12000))

    const form = new FormData()
    form.append('audio', audioBlob, 'recording.webm')
    photos.forEach((f) => form.append('images', f))
    contextFiles.forEach((f) => form.append('files', f))

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/process/', {
        method: 'POST',
        body: form,
        signal: abortRef.current.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setResults(data)
      navigate({ to: '/results' })
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return // cancelled — no error shown
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      clearTimers()
      setLoadingStep('idle')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-6 sm:p-8 flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">BrainJam</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Record your lecture. We'll handle the notes.</p>
        </div>

        {/* Audio */}
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step 1 — Record</h2>
          <AudioRecorder
            onRecordingComplete={(blob) => { setAudioBlob(blob); setError(null) }}
            onReset={() => setError(null)}
          />
        </section>

        <hr className="border-gray-100" />

        {/* Photos */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step 2 — Add board photos (optional)</h2>
          <PhotoCapture photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
        </section>

        <hr className="border-gray-100" />

        {/* Context files */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step 3 — Attach context files (optional)</h2>
          <ContextFiles files={contextFiles} onAdd={addContextFiles} onRemove={removeContextFile} />
        </section>

        <hr className="border-gray-100" />

        {/* Generate */}
        <section className="flex flex-col items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step 4 — Generate</h2>

          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {cancelled && !error && (
            <div className="w-full bg-gray-50 border border-gray-200 text-gray-600 rounded-xl px-4 py-3 text-sm">
              Generation cancelled.
            </div>
          )}

          {/* Loading step indicator */}
          {isLoading && (
            <div className="w-full flex items-center justify-between gap-1 py-2">
              {STEPS.map((step, i) => {
                const stepIndex = STEPS.indexOf(loadingStep as Exclude<LoadingStep, 'idle'>)
                const isDone = i < stepIndex
                const isActive = i === stepIndex
                return (
                  <div key={step} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isDone ? 'bg-green-500 text-white' :
                      isActive ? 'bg-indigo-600 text-white animate-pulse' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`text-[10px] text-center leading-tight ${
                      isActive ? 'text-indigo-600 font-semibold' :
                      isDone ? 'text-green-600' :
                      'text-gray-400'
                    }`}>
                      {STEP_LABELS[step]}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className={`absolute hidden`} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!audioBlob || isLoading}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-base sm:text-lg shadow-md transition-all active:scale-95"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="truncate">{STEP_LABELS[loadingStep as Exclude<LoadingStep, 'idle'>]}…</span>
              </span>
            ) : (
              'Generate Flashcards & Notes'
            )}
          </button>

          {isLoading && (
            <button
              onClick={handleCancel}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Cancel
            </button>
          )}

          {!audioBlob && !isLoading && (
            <p className="text-xs text-gray-400">Record audio first to enable generation</p>
          )}

          {!isLoading && (
            <button
              onClick={handleLoadDemo}
              className="text-xs text-gray-400 hover:text-indigo-500 underline transition-colors"
            >
              Load demo data
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
