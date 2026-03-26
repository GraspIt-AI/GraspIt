import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { getResults } from '../store'

export default function ResultsPage() {
  const state = getResults()
  const [tab, setTab] = useState<'flashcards' | 'notes' | 'transcript'>('flashcards')
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [copied, setCopied] = useState(false)

  // 2.6 — Polished empty state
  if (!state?.flashcards || state.flashcards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">
            🎓
          </div>
          <h2 className="text-xl font-bold text-gray-800">No results yet</h2>
          <p className="text-sm text-gray-500">Generate flashcards from a recorded lecture to see them here.</p>
          <Link
            to="/"
            className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Record a lecture
          </Link>
        </div>
      </div>
    )
  }

  const { flashcards, notes, transcript } = state

  return (
    <ResultsView
      flashcards={flashcards}
      notes={notes}
      transcript={transcript}
      tab={tab}
      setTab={setTab}
      cardIndex={cardIndex}
      setCardIndex={setCardIndex}
      cardFlipped={cardFlipped}
      setCardFlipped={setCardFlipped}
      copied={copied}
      setCopied={setCopied}
    />
  )
}

interface ResultsViewProps {
  flashcards: { front: string; back: string }[]
  notes: string
  transcript: string
  tab: 'flashcards' | 'notes' | 'transcript'
  setTab: (t: 'flashcards' | 'notes' | 'transcript') => void
  cardIndex: number
  setCardIndex: (fn: (i: number) => number) => void
  cardFlipped: boolean
  setCardFlipped: (v: boolean) => void
  copied: boolean
  setCopied: (v: boolean) => void
}

function ResultsView({
  flashcards, notes, transcript,
  tab, setTab,
  cardIndex, setCardIndex,
  cardFlipped, setCardFlipped,
  copied, setCopied,
}: ResultsViewProps) {

  // 2.3 — Keyboard navigation
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (tab !== 'flashcards') return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCardIndex((i) => {
        const next = Math.min(flashcards.length - 1, i + 1)
        if (next !== i) setCardFlipped(false)
        return next
      })
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCardIndex((i) => {
        const prev = Math.max(0, i - 1)
        if (prev !== i) setCardFlipped(false)
        return prev
      })
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setCardFlipped(!cardFlipped)
    }
  }, [tab, flashcards.length, cardFlipped, setCardIndex, setCardFlipped])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // 2.4 — Copy notes
  function copyNotes() {
    navigator.clipboard.writeText(notes).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function goToCard(next: number) {
    setCardIndex(() => next)
    setCardFlipped(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Your Lecture</h1>
          <Link
            to="/"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← New recording
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button
            onClick={() => setTab('flashcards')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'flashcards' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Flashcards ({flashcards.length})
          </button>
          <button
            onClick={() => setTab('notes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'notes' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Notes
          </button>
          {/* 2.2 — Only show transcript tab if data exists */}
          {transcript && (
            <button
              onClick={() => setTab('transcript')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'transcript' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Transcript
            </button>
          )}
        </div>

        {/* Flashcards view */}
        {tab === 'flashcards' && (
          <div className="flex flex-col gap-4">
            <FlashCard
              front={flashcards[cardIndex].front}
              back={flashcards[cardIndex].back}
              index={cardIndex}
              total={flashcards.length}
              flipped={cardFlipped}
              onFlip={() => setCardFlipped(!cardFlipped)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => goToCard(Math.max(0, cardIndex - 1))}
                disabled={cardIndex === 0}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => goToCard(Math.min(flashcards.length - 1, cardIndex + 1))}
                disabled={cardIndex === flashcards.length - 1}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
            <p className="text-center text-xs text-gray-400">Use arrow keys to navigate · Space or Enter to flip</p>
          </div>
        )}

        {/* Notes view */}
        {tab === 'notes' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <button
                onClick={copyNotes}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
              >
                {copied ? 'Copied!' : 'Copy notes'}
              </button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-5">
              <NotesViewer notes={notes} />
            </div>
          </div>
        )}

        {/* 2.2 — Transcript view */}
        {tab === 'transcript' && transcript && (
          <div className="bg-gray-50 rounded-2xl p-5 max-h-96 overflow-y-auto">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
              {transcript}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
