import { useState, useRef, useEffect } from 'react'

interface Props {
  onRecordingComplete: (blob: Blob) => void
  onReset?: () => void
}

export default function AudioRecorder({ onRecordingComplete, onReset }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [seconds, setSeconds] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

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
        onRecordingComplete(blob)
        stream.getTracks().forEach((t) => t.stop())
        setState('done')
      }

      recorder.start()
      setState('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setErrorMsg('Microphone access denied. Please allow microphone access in your browser settings and reload the page.')
      } else {
        setErrorMsg('Could not access microphone. Please check your device settings.')
      }
      setState('error')
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function reset() {
    setState('idle')
    setSeconds(0)
    setErrorMsg('')
    onReset?.()
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col items-center gap-4">
      {state === 'idle' && (
        <button
          onClick={startRecording}
          className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 15.2 14.47 17 12 17s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        </button>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-500 font-mono text-lg font-semibold">{fmt(seconds)}</span>
          </div>
          <button
            onClick={stopRecording}
            className="w-20 h-20 rounded-full bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
          <p className="text-sm text-gray-500">Recording… tap to stop</p>
        </div>
      )}

      {state === 'done' && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-green-700 font-medium">Audio captured ({fmt(seconds)})</p>
          <button onClick={reset} className="text-sm text-gray-400 underline hover:text-gray-600">
            Re-record
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-sm text-red-600 max-w-xs">{errorMsg}</p>
          <button onClick={reset} className="text-sm text-gray-400 underline hover:text-gray-600">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
