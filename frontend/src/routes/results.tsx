import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { getResults } from '../store'
import { api, type CourseListItem } from '../api'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
]

// ── Save-to-course panel ──────────────────────────────────────────────────────

interface SavePanelProps {
  onSaved: (courseId: number, lectureId: number) => void
  flashcards: { front: string; back: string }[]
  notes: string
  transcript: string
  title: string
  summary: string
}

function SavePanel({ onSaved, flashcards, notes, transcript, title, summary }: SavePanelProps) {
  const qc = useQueryClient()
  const [selectedCourseId, setSelectedCourseId] = useState<number | 'new' | null>(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseColor, setNewCourseColor] = useState(COLORS[0])

  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: api.courses.list })

  const save = useMutation({
    mutationFn: async () => {
      let courseId: number
      if (selectedCourseId === 'new') {
        const course = await api.courses.create({ name: newCourseName.trim(), color: newCourseColor })
        courseId = course.id
      } else {
        courseId = selectedCourseId as number
      }
      const lecture = await api.lectures.save({
        course: courseId,
        title,
        summary,
        transcript,
        notes,
        flashcards,
      })
      return { courseId, lectureId: lecture.id }
    },
    onSuccess: ({ courseId, lectureId }) => {
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['course', courseId] })
      onSaved(courseId, lectureId)
    },
  })

  const canSave =
    (selectedCourseId !== null && selectedCourseId !== 'new') ||
    (selectedCourseId === 'new' && newCourseName.trim().length > 0)

  return (
    <div className="border border-indigo-100 rounded-2xl bg-indigo-50 p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-indigo-800">Save to a course</h3>

      <div className="flex flex-col gap-2">
        {courses && courses.length > 0 && courses.map((c: CourseListItem) => (
          <button
            key={c.id}
            onClick={() => setSelectedCourseId(c.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
              selectedCourseId === c.id
                ? 'border-indigo-400 bg-white shadow-sm'
                : 'border-gray-200 bg-white hover:border-indigo-200'
            }`}
          >
            <span
              className="w-5 h-5 rounded-full shrink-0"
              style={{ background: c.color }}
            />
            <span className="flex-1 text-sm font-medium text-gray-800">{c.name}</span>
            <span className="text-xs text-gray-400">{c.lecture_count} lectures</span>
          </button>
        ))}

        <button
          onClick={() => setSelectedCourseId('new')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
            selectedCourseId === 'new'
              ? 'border-indigo-400 bg-white shadow-sm'
              : 'border-dashed border-gray-300 bg-white hover:border-indigo-300'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">+</span>
          <span className="text-sm text-gray-500">New course…</span>
        </button>
      </div>

      {selectedCourseId === 'new' && (
        <div className="flex flex-col gap-3 pl-1">
          <input
            autoFocus
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            placeholder="Course name (e.g. Biochemistry II)"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
          />
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewCourseColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: newCourseColor === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {save.error && (
        <p className="text-xs text-red-600">{(save.error as Error).message}</p>
      )}

      <button
        onClick={() => save.mutate()}
        disabled={!canSave || save.isPending}
        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
      >
        {save.isPending ? 'Saving…' : 'Save lecture'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const navigate = useNavigate()
  const state = getResults()
  const [tab, setTab] = useState<'flashcards' | 'notes' | 'transcript'>('flashcards')
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<{ courseId: number; lectureId: number } | null>(null)

  if (!state?.flashcards || state.flashcards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">🎓</div>
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

  const { flashcards, notes, transcript, title = 'Your Lecture', summary = '' } = state

  // Keyboard navigation
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
  }, [tab, flashcards.length, cardFlipped])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  function copyNotes() {
    navigator.clipboard.writeText(notes).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function goToCard(next: number) {
    setCardIndex(next)
    setCardFlipped(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title}</h1>
            {summary && (
              <p className="text-sm text-gray-500 mt-1 leading-snug">{summary}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <Link to="/courses" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              My Courses
            </Link>
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-700 font-medium">
              ← Record new
            </Link>
          </div>
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

        {/* Transcript view */}
        {tab === 'transcript' && transcript && (
          <div className="bg-gray-50 rounded-2xl p-5 max-h-96 overflow-y-auto">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
              {transcript}
            </p>
          </div>
        )}

        {/* Save to course */}
        <hr className="border-gray-100" />
        {saved ? (
          <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-3">
            <div className="flex items-center gap-2 text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold">Lecture saved!</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/courses/$courseId"
                params={{ courseId: String(saved.courseId) }}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                ← Back to course
              </Link>
              <button
                onClick={() => navigate({ to: '/lectures/$lectureId', params: { lectureId: String(saved.lectureId) } })}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                View saved →
              </button>
            </div>
          </div>
        ) : (
          <SavePanel
            flashcards={flashcards}
            notes={notes}
            transcript={transcript}
            title={title}
            summary={summary}
            onSaved={(courseId, lectureId) => setSaved({ courseId, lectureId })}
          />
        )}
      </div>
    </div>
  )
}
