import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import AudioRecorder from '../components/AudioRecorder'
import PhotoCapture from '../components/PhotoCapture'
import { setResults } from '../store'

export default function RecordPage() {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  function addPhotos(files: File[]) {
    setPhotos((prev) => [...prev, ...files])
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleGenerate() {
    if (!audioBlob) return
    setLoading(true)
    setError(null)

    const form = new FormData()
    // Use .webm extension so Whisper recognises the format
    form.append('audio', audioBlob, 'recording.webm')
    photos.forEach((f) => form.append('images', f))

    try {
      const res = await fetch('/api/process/', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setResults(data)
      navigate({ to: '/results' })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">BrainJam</h1>
          <p className="text-gray-500 mt-1">Record your lecture. We'll handle the notes.</p>
        </div>

        {/* Audio */}
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Step 1 — Record</h2>
          <AudioRecorder onRecordingComplete={setAudioBlob} />
        </section>

        <hr className="border-gray-100" />

        {/* Photos */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Step 2 — Add board photos (optional)</h2>
          <PhotoCapture photos={photos} onAdd={addPhotos} onRemove={removePhoto} />
        </section>

        <hr className="border-gray-100" />

        {/* Generate */}
        <section className="flex flex-col items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Step 3 — Generate</h2>
          {error && (
            <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!audioBlob || loading}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-lg shadow-md transition-all active:scale-95"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generating…
              </span>
            ) : (
              'Generate Flashcards & Notes'
            )}
          </button>
          {!audioBlob && (
            <p className="text-xs text-gray-400">Record audio first to enable generation</p>
          )}
        </section>
      </div>
    </div>
  )
}
