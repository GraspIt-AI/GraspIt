import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { usePrintNotes } from '../usePrintNotes'

interface Props {
  lectureId: number
}

export default function LecturePage({ lectureId }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: lecture, isLoading } = useQuery({
    queryKey: ['lecture', lectureId],
    queryFn: () => api.lectures.get(lectureId),
  })

  const del = useMutation({
    mutationFn: () => api.lectures.delete(lectureId),
    onSuccess: () => {
      if (lecture) {
        qc.invalidateQueries({ queryKey: ['course', lecture.course] })
      }
      navigate({ to: '/courses' })
    },
  })

  const updateTranscript = useMutation({
    mutationFn: (transcript: string) => api.lectures.update(lectureId, { transcript }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lecture', lectureId] })
      setEditingTranscript(false)
    },
  })

  const updateTags = useMutation({
    mutationFn: (tags: string[]) => api.lectures.update(lectureId, { tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lecture', lectureId] })
      qc.invalidateQueries({ queryKey: ['course', lecture?.course] })
      setEditingTags(false)
    },
  })

  const regenerate = useMutation({
    mutationFn: () => api.lectures.regenerate(lectureId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lecture', lectureId] })
      setTimeout(() => { regenerate.reset(); updateTranscript.reset() }, 3000)
    },
  })

  const { data: course } = useQuery({
    queryKey: ['course', lecture?.course],
    queryFn: () => api.courses.get(lecture!.course),
    enabled: !!lecture,
  })
  const siblings = course?.lectures ?? []
  const siblingIdx = siblings.findIndex((l) => l.id === lectureId)
  const prevId = siblingIdx > 0 ? siblings[siblingIdx - 1].id : null
  const nextId = siblingIdx < siblings.length - 1 ? siblings[siblingIdx + 1].id : null

  const [tab, setTab] = useState<'flashcards' | 'notes' | 'transcript'>('flashcards')
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [editingTags, setEditingTags] = useState(false)
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const { triggerPrint, printPortal } = usePrintNotes(lecture?.title ?? '', lecture?.notes ?? '')

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!lecture || tab !== 'flashcards') return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCardIndex((i) => {
        const next = Math.min(lecture.flashcards.length - 1, i + 1)
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
      setCardFlipped((f) => !f)
    }
  }, [lecture, tab])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!lecture) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Lecture not found.</p>
          <Link to="/courses" className="text-indigo-600 text-sm mt-2 inline-block">← Back to courses</Link>
        </div>
      </div>
    )
  }

  function goToCard(next: number) {
    setCardIndex(next)
    setCardFlipped(false)
  }

  function copyNotes() {
    navigator.clipboard.writeText(lecture!.notes).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function startEditingTags() {
    setTagsDraft([...(lecture?.tags ?? [])])
    setTagInput('')
    setEditingTags(true)
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !tagsDraft.includes(t)) {
      setTagsDraft((prev) => [...prev, t])
    }
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTagsDraft((prev) => prev.filter((t) => t !== tag))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link
              to="/courses/$courseId"
              params={{ courseId: String(lecture.course) }}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
            >
              ← Back to course
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mt-1">{lecture.title}</h1>
            {lecture.summary && (
              <p className="text-sm text-gray-500 mt-1 leading-snug">{lecture.summary}</p>
            )}

            {/* Tags */}
            {editingTags ? (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {tagsDraft.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-red-500 leading-none ml-0.5">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Add tag (press Enter)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  />
                  <button onClick={addTag} className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium border border-indigo-200">
                    Add
                  </button>
                </div>
                {/* Suggestions: tags already used in this course, not yet in draft */}
                {(() => {
                  const suggestions = [
                    ...new Set(
                      (course?.lectures ?? [])
                        .filter((l) => l.id !== lectureId)
                        .flatMap((l) => l.tags ?? [])
                    ),
                  ].filter((t) => !tagsDraft.includes(t))
                  if (suggestions.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-gray-400 self-center">Existing:</span>
                      {suggestions.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTagsDraft((prev) => [...prev, t])}
                          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-indigo-200 text-indigo-500 hover:bg-indigo-50 transition-colors"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <div className="flex items-center gap-2">
                  {updateTags.error && (
                    <span className="text-xs text-red-500">{(updateTags.error as Error).message}</span>
                  )}
                  <button
                    onClick={() => setEditingTags(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateTags.mutate(tagsDraft)}
                    disabled={updateTags.isPending}
                    className="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 font-medium"
                  >
                    {updateTags.isPending ? 'Saving…' : 'Save tags'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {lecture.tags?.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
                    {tag}
                  </span>
                ))}
                <button
                  onClick={startEditingTags}
                  className="text-xs text-gray-400 hover:text-indigo-500 transition-colors"
                  title="Edit tags"
                >
                  {lecture.tags?.length > 0 ? 'Edit tags' : '+ Add tags'}
                </button>
              </div>
            )}
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2 shrink-0 mt-1">
              <span className="text-xs text-gray-500">Delete?</span>
              <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-2xl leading-none mt-1"
              title="Delete lecture"
            >
              ×
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button
            onClick={() => setTab('flashcards')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'flashcards' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Flashcards ({lecture.flashcards.length})
          </button>
          <button
            onClick={() => setTab('notes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'notes' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Notes
          </button>
          {lecture.transcript && (
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

        {/* Regenerate alert */}
        {updateTranscript.isSuccess && !editingTranscript && (
          regenerate.isSuccess ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-green-700 font-medium">Notes and flashcards regenerated.</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <p className="text-xs text-amber-800 font-medium">Transcript updated — regenerate notes and flashcards to match?</p>
              <div className="flex items-center gap-2 shrink-0">
                {regenerate.error && (
                  <span className="text-xs text-red-500">{(regenerate.error as Error).message}</span>
                )}
                <button
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors font-medium"
                >
                  {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </div>
          )
        )}

        {/* Flashcards view */}
        {tab === 'flashcards' && (
          <div className="flex flex-col gap-4">
            <FlashCard
              front={lecture.flashcards[cardIndex].front}
              back={lecture.flashcards[cardIndex].back}
              index={cardIndex}
              total={lecture.flashcards.length}
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
                onClick={() => goToCard(Math.min(lecture.flashcards.length - 1, cardIndex + 1))}
                disabled={cardIndex === lecture.flashcards.length - 1}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">Arrow keys to navigate · Space to flip</p>
          </div>
        )}

        {/* Notes view */}
        {tab === 'notes' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end gap-2">
              <button
                onClick={triggerPrint}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
              >
                Export PDF
              </button>
              <button
                onClick={copyNotes}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
              >
                {copied ? 'Copied!' : 'Copy notes'}
              </button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-5">
              <NotesViewer notes={lecture.notes} />
            </div>
          </div>
        )}
        {printPortal}

        {/* Transcript view */}
        {tab === 'transcript' && lecture.transcript && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              {editingTranscript ? (
                <div className="flex items-center gap-2">
                  {updateTranscript.error && (
                    <span className="text-xs text-red-500">{(updateTranscript.error as Error).message}</span>
                  )}
                  <button
                    onClick={() => { setEditingTranscript(false); updateTranscript.reset() }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateTranscript.mutate(transcriptDraft)}
                    disabled={updateTranscript.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
                  >
                    {updateTranscript.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setTranscriptDraft(lecture.transcript); setEditingTranscript(true); updateTranscript.reset() }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Edit
                </button>
              )}
            </div>
            {editingTranscript ? (
              <textarea
                autoFocus
                className="w-full bg-gray-50 rounded-2xl p-5 max-h-96 text-sm text-gray-700 leading-relaxed font-mono resize-none outline-none focus:ring-2 focus:ring-indigo-200 border border-indigo-200 overflow-y-auto"
                rows={12}
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
              />
            ) : (
              <div className="bg-gray-50 rounded-2xl p-5 max-h-96 overflow-y-auto">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
                  {lecture.transcript}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Prev / Next lecture navigation */}
        {(prevId !== null || nextId !== null) && (
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            {prevId !== null ? (
              <Link
                to="/lectures/$lectureId"
                params={{ lectureId: String(prevId) }}
                className="flex-1 py-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                ← Prev lecture
              </Link>
            ) : <div className="flex-1" />}
            {nextId !== null ? (
              <Link
                to="/lectures/$lectureId"
                params={{ lectureId: String(nextId) }}
                className="flex-1 py-2 text-sm text-right text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Next lecture →
              </Link>
            ) : <div className="flex-1" />}
          </div>
        )}
      </div>
    </div>
  )
}
