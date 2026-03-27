import { useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, Link } from '@tanstack/react-router'
import AudioRecorder from '../components/AudioRecorder'
import PhotoCapture from '../components/PhotoCapture'
import ContextFiles from '../components/ContextFiles'
import UserMenu from '../components/UserMenu'
import { setResults } from '../store'
import { getAccessToken } from '../authStore'
import { API_BASE } from '../api'

type LoadingStep = 'idle' | 'uploading' | 'transcribing' | 'generating'

const STEP_LABELS: Record<Exclude<LoadingStep, 'idle'>, string> = {
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  generating: 'Generating flashcards',
}

const STEPS: Exclude<LoadingStep, 'idle'>[] = ['uploading', 'transcribing', 'generating']

export default function RecordPage() {
  const [audioFiles, setAudioFiles] = useState<Array<{ blob: Blob; filename: string }>>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [contextFiles, setContextFiles] = useState<File[]>([])
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle')
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const navigate = useNavigate()
  const abortRef = useRef<AbortController | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const isLoading = loadingStep !== 'idle'
  const hasAnyInput = !!(audioFiles.length > 0 || photos.length > 0 || contextFiles.length > 0)

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
    setError(null)
    setCancelled(false)
    setLoadingStep('uploading')

    // Time-based step progression: adjust for multiple audio files
    const hasAudio = audioFiles.length > 0
    if (hasAudio) {
      timersRef.current.push(setTimeout(() => setLoadingStep('transcribing'), 2000))
      timersRef.current.push(setTimeout(() => setLoadingStep('generating'), 12000))
    } else {
      timersRef.current.push(setTimeout(() => setLoadingStep('generating'), 1000))
    }

    abortRef.current = new AbortController()

    let shouldNavigate = false
    try {
      const token = getAccessToken()
      const allResults: Array<any> = []

      // Process each audio file sequentially
      // First audio gets all context; subsequent audios are lighter
      for (let i = 0; i < audioFiles.length; i++) {
        setCurrentAudioIndex(i + 1)
        const { blob, filename } = audioFiles[i]
        const isFirstAudio = i === 0

        const form = new FormData()
        form.append('audio', blob, filename)
        photos.forEach((f) => form.append('images', f))
        // Only send context files with the first audio file to keep requests manageable
        if (isFirstAudio) {
          contextFiles.forEach((f) => form.append('files', f))
        }

        const res = await fetch(`${API_BASE}/api/process/`, {
          method: 'POST',
          body: form,
          signal: abortRef.current.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) {
          const text = await res.text()
          let msg: string
          try { msg = (JSON.parse(text) as { error?: string }).error ?? text } catch { msg = text }
          throw new Error(`HTTP ${res.status} from ${new URL(res.url).hostname}: ${msg.slice(0, 300)}`)
        }
        const data = await res.json()
        allResults.push({ ...data, _audioFile: filename })
      }

      // If no audio files, process with just photos/context files
      if (audioFiles.length === 0) {
        const form = new FormData()
        photos.forEach((f) => form.append('images', f))
        contextFiles.forEach((f) => form.append('files', f))

        const res = await fetch(`${API_BASE}/api/process/`, {
          method: 'POST',
          body: form,
          signal: abortRef.current.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) {
          const text = await res.text()
          let msg: string
          try { msg = (JSON.parse(text) as { error?: string }).error ?? text } catch { msg = text }
          throw new Error(`HTTP ${res.status} from ${new URL(res.url).hostname}: ${msg.slice(0, 300)}`)
        }
        const data = await res.json()
        setResults(data)
      } else if (allResults.length === 1) {
        // Single audio file: just use the result as-is
        setResults(allResults[0])
      } else {
        // Multiple audio files: combine results
        const combined = combineResults(allResults)
        setResults(combined)
      }

      shouldNavigate = true
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      clearTimers()
      flushSync(() => {
        setLoadingStep('idle')
        setCurrentAudioIndex(0)
      })
    }
    if (shouldNavigate) navigate({ to: '/results' })
  }

  function combineResults(results: Array<any>) {
    // Combine multiple API results into a single result
    const transcriptParts = results.map((r, i) => `Part ${i + 1} — ${r._audioFile}\n${r.transcript}`).join('\n\n')
    const flashcards = results.flatMap((r) => r.flashcards || [])
    const notesParts = results
      .map((r, i) => `## Part ${i + 1} — ${r._audioFile}\n\n${r.notes}`)
      .join('\n\n---\n\n')
    const tags = [...new Set(results.flatMap((r) => r.tags || []))] // Union + deduplicate
    const titles = results.map((r) => r.title).join(' · ')
    const summaries = results.map((r, i) => `Part ${i + 1}: ${r.summary}`).join(' ')

    return {
      title: titles,
      summary: summaries,
      transcript: transcriptParts,
      flashcards,
      notes: notesParts,
      tags,
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
          ← Home
        </Link>
        <UserMenu />
      </nav>

      <div className="max-w-2xl mx-auto px-5 sm:px-6">
        {/* Page header */}
        <section className="pt-10 pb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">New Lecture</h1>
          <p className="text-lg text-gray-400 mt-2">Record, upload, or snap a photo.</p>
        </section>

        {/* Input sections */}
        <div className="flex flex-col gap-4 pb-16">

          {/* Audio */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
              Audio — optional (record, upload, or both)
            </p>
            <AudioRecorder
              audioFiles={audioFiles}
              onAdd={(blob, filename) => {
                setAudioFiles((prev) => [...prev, { blob, filename }])
                setError(null)
              }}
              onRemove={(i) => setAudioFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>

          {/* Photos */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Board photos — optional
            </p>
            <PhotoCapture photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
          </div>

          {/* Context files */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Context files — optional
            </p>
            <ContextFiles files={contextFiles} onAdd={addContextFiles} onRemove={removeContextFile} />
          </div>

          {/* Generate */}
          <div className="flex flex-col gap-3 pt-2">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm flex flex-col gap-1">
                <span className="font-medium">{error}</span>
                {audioFiles.length > 0 && (
                  <span className="text-red-500 text-xs">Your audio is preserved — just try again.</span>
                )}
              </div>
            )}

            {cancelled && !error && (
              <div className="bg-white border border-gray-200 text-gray-500 rounded-2xl px-5 py-4 text-sm">
                Generation cancelled.
              </div>
            )}

            {/* Loading step indicator */}
            {isLoading && (
              <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex flex-col gap-3">
                {audioFiles.length > 1 && (
                  <p className="text-xs text-gray-500 text-center">
                    Processing audio {currentAudioIndex} of {audioFiles.length}…
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  {STEPS.map((step, i) => {
                    const stepIndex = STEPS.indexOf(loadingStep as Exclude<LoadingStep, 'idle'>)
                    const isDone = i < stepIndex
                    const isActive = i === stepIndex
                    return (
                      <div key={step} className="flex-1 flex flex-col items-center gap-1.5">
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
                        <span className={`text-[10px] text-center leading-tight font-medium ${
                          isActive ? 'text-indigo-600' :
                          isDone ? 'text-green-600' :
                          'text-gray-400'
                        }`}>
                          {STEP_LABELS[step]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Main CTA — matches home page style */}
            <button
              onClick={handleGenerate}
              disabled={!hasAnyInput || isLoading}
              className="w-full flex items-center justify-between px-6 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-violet-700 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:shadow-none transition-all active:scale-[0.99] group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/15 disabled:bg-gray-100 flex items-center justify-center shrink-0">
                  {isLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  )}
                </div>
                <div className="text-left">
                  <div className="text-base font-bold leading-tight">
                    {isLoading ? STEP_LABELS[loadingStep as Exclude<LoadingStep, 'idle'>] + '…' : 'Generate Flashcards & Notes'}
                  </div>
                  {!isLoading && (
                    <div className="text-sm text-white/60 mt-0.5">
                      {hasAnyInput ? 'Ready to process your lecture' : 'Add audio, a photo, or a file above'}
                    </div>
                  )}
                </div>
              </div>
              {!isLoading && (
                <svg className="w-5 h-5 text-white/60 group-hover:translate-x-1 transition-transform shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>

            {isLoading && (
              <button
                onClick={handleCancel}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors text-center"
              >
                Cancel
              </button>
            )}

            {!isLoading && (
              <button
                onClick={handleLoadDemo}
                className="text-xs text-gray-400 hover:text-indigo-500 underline transition-colors text-center"
              >
                Load demo data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
