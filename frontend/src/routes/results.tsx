import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { getResults } from '../store'
import { api, type CourseListItem } from '../api'
import { getAccessToken } from '../authStore'
import { usePrintNotes } from '../usePrintNotes'
import UserMenu from '../components/UserMenu'

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
  tags: string[]
}

function SavePanel({ onSaved, flashcards, notes, transcript, title, summary, tags }: SavePanelProps) {
  const qc = useQueryClient()
  const [selectedCourseId, setSelectedCourseId] = useState<number | 'new' | 'misc' | null>(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseColor, setNewCourseColor] = useState(COLORS[0])

  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: api.courses.list })

  const save = useMutation({
    mutationFn: async () => {
      let courseId: number
      if (selectedCourseId === 'new') {
        const course = await api.courses.create({ name: newCourseName.trim(), color: newCourseColor })
        courseId = course.id
      } else if (selectedCourseId === 'misc') {
        const course = await api.courses.default()
        courseId = course.id
      } else {
        courseId = selectedCourseId as number
      }
      const lecture = await api.lectures.save({ course: courseId, title, summary, tags, transcript, notes, flashcards })
      return { courseId, lectureId: lecture.id }
    },
    onSuccess: ({ courseId, lectureId }) => {
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['course', courseId] })
      onSaved(courseId, lectureId)
    },
  })

  const canSave =
    selectedCourseId === 'misc' ||
    (selectedCourseId !== null && selectedCourseId !== 'new') ||
    (selectedCourseId === 'new' && newCourseName.trim().length > 0)

  const regularCourses = (courses?.courses ?? []).filter((c: CourseListItem) => c.name !== 'Miscellaneous')

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-bold text-gray-900">Save to a course</h3>

      <div className="flex flex-col gap-2">
        {regularCourses.length > 0 && regularCourses.map((c: CourseListItem) => (
          <button
            key={c.id}
            onClick={() => setSelectedCourseId(c.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
              selectedCourseId === c.id
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 bg-white hover:border-indigo-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full shrink-0" style={{ background: c.color }} />
            <span className="flex-1 text-sm font-medium text-gray-800">{c.name}</span>
            <span className="text-xs text-gray-400">{c.lecture_count} lectures</span>
          </button>
        ))}

        <button
          onClick={() => setSelectedCourseId('misc')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
            selectedCourseId === 'misc' ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <span className="w-5 h-5 rounded-full shrink-0 bg-gray-400" />
          <span className="flex-1 text-sm text-gray-500">Miscellaneous <span className="text-xs text-gray-400">(no course)</span></span>
        </button>

        <button
          onClick={() => setSelectedCourseId('new')}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors ${
            selectedCourseId === 'new' ? 'border-indigo-400 bg-indigo-50' : 'border-dashed border-gray-300 bg-white hover:border-indigo-300'
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
                style={{ background: c, outline: newCourseColor === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>
      )}

      {save.error && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}

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
  const [editedTranscript, setEditedTranscript] = useState<string | null>(null)

  const savedRef = useRef(saved)
  const defaultCourseIdRef = useRef<number | null>(null)

  useEffect(() => { savedRef.current = saved }, [saved])

  const { triggerPrint, printPortal } = usePrintNotes(state?.title ?? 'Your Lecture', state?.notes ?? '')

  useEffect(() => {
    if (!state?.flashcards?.length) return
    api.courses.default().then((c) => { defaultCourseIdRef.current = c.id }).catch(() => {})
  }, [state?.flashcards?.length])

  const flashcardsForKey = state?.flashcards ?? []
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (tab !== 'flashcards') return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCardIndex((i) => { const next = Math.min(flashcardsForKey.length - 1, i + 1); if (next !== i) setCardFlipped(false); return next })
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCardIndex((i) => { const prev = Math.max(0, i - 1); if (prev !== i) setCardFlipped(false); return prev })
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setCardFlipped((f) => !f)
    }
  }, [tab, flashcardsForKey.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    return () => {
      if (savedRef.current || !state?.flashcards?.length || !defaultCourseIdRef.current) return
      const token = getAccessToken()
      fetch('/api/lectures/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          course: defaultCourseIdRef.current,
          title: state.title || 'Untitled Lecture',
          summary: state.summary || '',
          tags: state.tags || [],
          transcript: state.transcript || '',
          notes: state.notes || '',
          flashcards: state.flashcards,
        }),
        keepalive: true,
      }).catch(() => {})
    }
    // Unmount only: with deps, the cleanup would fire (and save a lecture) every time state changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!state?.flashcards || state.flashcards.length === 0) {
    const hadGeneration = state !== null
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-10 flex flex-col items-center gap-4 max-w-sm w-full text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{hadGeneration ? 'No flashcards generated' : 'No results yet'}</h2>
          <p className="text-sm text-gray-400">{hadGeneration ? 'The audio may not have captured enough speech. Try adding a whiteboard photo or uploading an audio file instead.' : 'Generate flashcards from a recorded lecture to see them here.'}</p>
          <Link
            to="/record"
            className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Record a lecture
          </Link>
        </div>
      </div>
    )
  }

  const { flashcards, notes, transcript: rawTranscript, title = 'Your Lecture', summary = '', tags = [] } = state
  const transcript = editedTranscript ?? rawTranscript

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
    <div className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/record" className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
            ← New lecture
          </Link>
          <Link to="/courses" className="hidden sm:block text-sm text-gray-400 hover:text-gray-600 transition-colors">
            My Courses
          </Link>
        </div>
        <UserMenu />
      </nav>

      <div className="max-w-2xl mx-auto px-5 sm:px-6">
        {/* Lecture header */}
        <section className="pt-10 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight leading-tight">{title}</h1>
          {summary && <p className="text-sm text-gray-400 mt-2 leading-relaxed">{summary}</p>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => (
                <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Content card */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-1 pt-1 gap-1">
            {(['flashcards', 'notes', ...(transcript ? ['transcript'] : [])] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as typeof tab)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors capitalize ${
                  tab === t ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'flashcards' ? `Flashcards (${flashcards.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Flashcards */}
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
                <p className="text-xs text-gray-400 text-center">Arrow keys to navigate · Space to flip</p>
              </div>
            )}

            {/* Notes */}
            {tab === 'notes' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-end gap-2">
                  <button onClick={triggerPrint} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                    Export PDF
                  </button>
                  <button onClick={copyNotes} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                    {copied ? 'Copied!' : 'Copy notes'}
                  </button>
                </div>
                <div className="bg-[#fafafa] rounded-xl p-5">
                  <NotesViewer notes={notes} />
                </div>
              </div>
            )}
            {printPortal}

            {/* Transcript */}
            {tab === 'transcript' && transcript && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-400">Edits are saved when you save the lecture</p>
                <textarea
                  className="w-full bg-[#fafafa] rounded-xl p-4 max-h-96 text-sm text-gray-700 leading-relaxed font-mono resize-none outline-none focus:ring-2 focus:ring-indigo-200 border border-transparent focus:border-indigo-200 overflow-y-auto"
                  rows={12}
                  value={transcript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Save section */}
        <div className="pb-16">
          {saved ? (
            <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
              <div className="flex items-center gap-2 text-green-700">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-semibold">Lecture saved!</span>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  to="/courses/$courseId"
                  params={{ courseId: String(saved.courseId) }}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  ← Back to course
                </Link>
                <button
                  onClick={() => navigate({ to: '/lectures/$lectureId', params: { lectureId: String(saved.lectureId) } })}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
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
              tags={tags}
              onSaved={(courseId, lectureId) => setSaved({ courseId, lectureId })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
