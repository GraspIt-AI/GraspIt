import { useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import AudioRecorder from '../components/AudioRecorder'
import PhotoCapture from '../components/PhotoCapture'
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

        {/* Generate */}
        <section className="flex flex-col items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Step 3 — Generate</h2>

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
        </section>
      </div>
    </div>
  )
}
