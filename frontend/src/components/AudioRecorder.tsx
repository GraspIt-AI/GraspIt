import { useState, useRef, useEffect } from 'react'

interface Props {
  onRecordingComplete: (blob: Blob, filename: string) => void
  onReset?: () => void
}

const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm,.mp4,.mpeg'

function formatSeconds(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AudioRecorder({ onRecordingComplete, onReset }: Props) {
  const [mode, setMode] = useState<'record' | 'upload'>('record')
  const [recState, setRecState] = useState<'idle' | 'recording' | 'paused' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // ── Record mode ──────────────────────────────────────────────────────────────

  async function startRecording() {
    setErrorMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorder.current = recorder
      chunks.current = []

      recorder.ondataavailable = (e) => chunks.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType })
        onRecordingComplete(blob, 'recording.webm')
        stream.getTracks().forEach((t) => t.stop())
        setRecState('done')
      }

      recorder.start()
      setRecState('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg('Microphone access denied. Please allow microphone access in your browser settings and reload the page.')
      } else {
        setErrorMsg('Could not access microphone. Please check your device settings.')
      }
      setRecState('error')
    }
  }

  function pauseRecording() {
    mediaRecorder.current?.pause()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecState('paused')
  }

  function resumeRecording() {
    mediaRecorder.current?.resume()
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    setRecState('recording')
  }

  function stopRecording() {
    mediaRecorder.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function resetRecorder() {
    setRecState('idle')
    setSeconds(0)
    setErrorMsg('')
    onReset?.()
  }

  // ── Upload mode ──────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    onRecordingComplete(file, file.name)
    e.target.value = ''
  }

  function clearUpload() {
    setUploadedFile(null)
    onReset?.()
  }

  // ── Mode switch ──────────────────────────────────────────────────────────────

  function switchMode(m: 'record' | 'upload') {
    setMode(m)
    // Reset both states when switching so parent blob is cleared cleanly
    setRecState('idle')
    setSeconds(0)
    setErrorMsg('')
    setUploadedFile(null)
    onReset?.()
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Mode toggle */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1 w-full max-w-xs">
        <button
          onClick={() => switchMode('record')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === 'record' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          🎙️ Record
        </button>
        <button
          onClick={() => switchMode('upload')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === 'upload' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          📁 Upload audio
        </button>
      </div>

      {/* ── Record mode ── */}
      {mode === 'record' && (
        <>
          {recState === 'idle' && (
            <button
              onClick={startRecording}
              className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 15.2 14.47 17 12 17s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
              </svg>
            </button>
          )}

          {(recState === 'recording' || recState === 'paused') && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                {recState === 'recording'
                  ? <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  : <span className="w-3 h-3 rounded-full bg-amber-400" />
                }
                <span className={`font-mono text-lg font-semibold ${recState === 'paused' ? 'text-amber-500' : 'text-red-500'}`}>
                  {formatSeconds(seconds)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {recState === 'recording' ? (
                  <button
                    onClick={pauseRecording}
                    title="Pause"
                    className="w-14 h-14 rounded-full bg-amber-400 hover:bg-amber-500 text-white flex items-center justify-center shadow-md transition-transform hover:scale-105 active:scale-95"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="5" width="4" height="14" />
                      <rect x="14" y="5" width="4" height="14" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={resumeRecording}
                    title="Resume"
                    className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-md transition-transform hover:scale-105 active:scale-95"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={stopRecording}
                  title="Stop"
                  className="w-20 h-20 rounded-full bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-500">
                {recState === 'paused' ? 'Paused — resume or stop' : 'Recording… pause or stop'}
              </p>
            </div>
          )}

          {recState === 'done' && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-700 font-medium text-sm">Recorded ({formatSeconds(seconds)})</p>
              <p className="text-xs text-gray-400">Recording saved — you can generate or re-record</p>
              <button onClick={resetRecorder} className="text-sm text-gray-400 underline hover:text-gray-600">
                Re-record
              </button>
            </div>
          )}

          {recState === 'error' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-600 max-w-xs">{errorMsg}</p>
              <button onClick={resetRecorder} className="text-sm text-gray-400 underline hover:text-gray-600">
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Upload mode ── */}
      {mode === 'upload' && (
        <>
          {!uploadedFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 w-full max-w-xs px-6 py-8 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-400 hover:text-indigo-500 transition-colors"
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload audio</p>
                <p className="text-xs mt-0.5">MP3, WAV, M4A, OGG, FLAC, AAC…</p>
              </div>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2 w-full max-w-xs">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-800 text-center truncate max-w-full px-2">{uploadedFile.name}</p>
              <p className="text-xs text-gray-400">{formatSize(uploadedFile.size)}</p>
              <p className="text-xs text-gray-400">File saved — you can generate or change it</p>
              <button onClick={clearUpload} className="text-sm text-gray-400 underline hover:text-gray-600">
                Change file
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO}
            onChange={handleFileChange}
            className="hidden"
          />
        </>
      )}
    </div>
  )
}
