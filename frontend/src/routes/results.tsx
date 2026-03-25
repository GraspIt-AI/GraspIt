import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { getResults } from '../store'

export default function ResultsPage() {
  const state = getResults()
  const [tab, setTab] = useState<'flashcards' | 'notes'>('flashcards')
  const [cardIndex, setCardIndex] = useState(0)

  if (!state?.flashcards || state.flashcards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
        <p>No results yet.</p>
        <Link to="/" className="text-indigo-600 underline">Go record a lecture</Link>
      </div>
    )
  }

  const { flashcards, notes } = state!

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
        </div>

        {/* Flashcards view */}
        {tab === 'flashcards' && (
          <div className="flex flex-col gap-4">
            <FlashCard
              front={flashcards[cardIndex].front}
              back={flashcards[cardIndex].back}
              index={cardIndex}
              total={flashcards.length}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                disabled={cardIndex === 0}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setCardIndex((i) => Math.min(flashcards.length - 1, i + 1))}
                disabled={cardIndex === flashcards.length - 1}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Notes view */}
        {tab === 'notes' && (
          <div className="bg-gray-50 rounded-2xl p-5">
            <NotesViewer notes={notes} />
          </div>
        )}
      </div>
    </div>
  )
}
