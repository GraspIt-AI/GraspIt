import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile } from '../api'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import AudioRecorder from '../components/AudioRecorder'
import ContextFiles from '../components/ContextFiles'
import { usePrintNotes } from '../usePrintNotes'
import UserMenu from '../components/UserMenu'

interface Props {
  lectureId: number
}

function AppendModal({ lectureId, onClose }: { lectureId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [audioFiles, setAudioFiles] = useState<Array<{ blob: Blob; filename: string }>>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [contextFiles, setContextFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const hasInput = audioFiles.length > 0 || photos.length > 0 || contextFiles.length > 0

  async function handleAppend() {
    if (!hasInput) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      audioFiles.forEach(({ blob, filename }) => form.append('audio', blob, filename))
      photos.forEach((f) => form.append('images', f))
      contextFiles.forEach((f) => form.append('files', f))
      await api.lectures.append(lectureId, form)
      qc.invalidateQueries({ queryKey: ['lecture', lectureId] })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm px-0 sm:px-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add more content</h2>
            <p className="text-xs text-gray-400 mt-0.5">New flashcards and notes will be appended to this lecture</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Audio */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Audio</p>
            <AudioRecorder
              audioFiles={audioFiles}
              onAdd={(blob, filename) => setAudioFiles((prev) => [...prev, { blob, filename }])}
              onRemove={(i) => setAudioFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>

          {/* Photos */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Photos</p>
            <div className="flex gap-2">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-400 hover:text-indigo-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Upload photos
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) setPhotos((p) => [...p, ...Array.from(e.target.files!)]); e.target.value = '' }} />
            </div>
            {photos.length > 0 && (
              <div className="flex flex-col gap-1">
                {photos.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <button onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Context files */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Context files</p>
            <ContextFiles
              files={contextFiles}
              onAdd={(f) => setContextFiles((prev) => [...prev, ...f])}
              onRemove={(i) => setContextFiles((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleAppend}
            disabled={!hasInput || loading}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Generating…' : 'Generate & Append'}
          </button>
        </div>
      </div>
    </div>
  )
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
      if (lecture) qc.invalidateQueries({ queryKey: ['course', lecture.course] })
      navigate({ to: '/courses' })
    },
  })

  const updateTranscript = useMutation({
    mutationFn: (transcript: string) => api.lectures.update(lectureId, { transcript }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lecture', lectureId] }); setEditingTranscript(false) },
  })

  const updateNotes = useMutation({
    mutationFn: (notes: string) => api.lectures.update(lectureId, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lecture', lectureId] }); setEditingNotes(false) },
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

  const clearAll = useMutation({
    mutationFn: () => api.lectures.clear(lectureId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lecture', lectureId] }); setConfirmClear(false) },
  })

  const deleteFlashcard = useMutation({
    mutationFn: (flashcardId: number) => api.flashcards.delete(flashcardId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lecture', lectureId] }),
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
  const [ankiExporting, setAnkiExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteCard, setConfirmDeleteCard] = useState(false)
  const [showAppend, setShowAppend] = useState(false)
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [editingTags, setEditingTags] = useState(false)
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const { triggerPrint, printPortal } = usePrintNotes(lecture?.title ?? '', lecture?.notes ?? '')

  useEffect(() => { setCardIndex(0); setCardFlipped(false) }, [lecture?.flashcards.length])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!lecture || tab !== 'flashcards') return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCardIndex((i) => { const next = Math.min(lecture.flashcards.length - 1, i + 1); if (next !== i) setCardFlipped(false); return next })
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCardIndex((i) => { const prev = Math.max(0, i - 1); if (prev !== i) setCardFlipped(false); return prev })
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
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!lecture) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Lecture not found.</p>
          <Link to="/courses" className="text-indigo-500 text-sm mt-2 inline-block hover:text-indigo-700">← Back to courses</Link>
        </div>
      </div>
    )
  }

  function goToCard(next: number) { setCardIndex(next); setCardFlipped(false) }

  function copyNotes() {
    navigator.clipboard.writeText(lecture!.notes).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function startEditingTags() { setTagsDraft([...(lecture?.tags ?? [])]); setTagInput(''); setEditingTags(true) }
  function addTag() { const t = tagInput.trim(); if (t && !tagsDraft.includes(t)) setTagsDraft((p) => [...p, t]); setTagInput('') }
  function removeTag(tag: string) { setTagsDraft((p) => p.filter((t) => t !== tag)) }

  const safeIdx = Math.min(cardIndex, lecture.flashcards.length - 1)

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/courses/$courseId" params={{ courseId: String(lecture.course) }}
          className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
          ← Back to course
        </Link>
        <div className="flex items-center gap-2">
          {/* Add more content */}
          <button onClick={() => setShowAppend(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
            title="Add more content">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:block">Add content</span>
          </button>
          {/* Clear all */}
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Erase everything?</span>
              <button onClick={() => clearAll.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Erase</button>
              <button onClick={() => setConfirmClear(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)}
              className="p-2 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50"
              title="Erase all content (flashcards, notes, transcript)">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
              </svg>
            </button>
          )}
          {/* Delete lecture */}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Delete lecture?</span>
              <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="p-2 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50" title="Delete lecture">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
          <UserMenu />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 sm:px-6">
        {/* Lecture header */}
        <section className="pt-10 pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight leading-tight">{lecture.title}</h1>
          {lecture.summary && <p className="text-sm text-gray-400 mt-2 leading-relaxed">{lecture.summary}</p>}

          {/* Tags */}
          <div className="mt-3">
            {editingTags ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {tagsDraft.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-red-500 leading-none ml-0.5">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input autoFocus
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Add tag (press Enter)" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} />
                  <button onClick={addTag} className="text-xs px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium border border-indigo-200">Add</button>
                </div>
                {(() => {
                  const suggestions = [...new Set((course?.lectures ?? []).filter((l) => l.id !== lectureId).flatMap((l) => l.tags ?? []))].filter((t) => !tagsDraft.includes(t))
                  if (!suggestions.length) return null
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-gray-400 self-center">Existing:</span>
                      {suggestions.map((t) => (
                        <button key={t} onClick={() => setTagsDraft((p) => [...p, t])}
                          className="text-xs px-2.5 py-1 rounded-full border border-dashed border-indigo-200 text-indigo-500 hover:bg-indigo-50 transition-colors">+ {t}</button>
                      ))}
                    </div>
                  )
                })()}
                <div className="flex items-center gap-2">
                  {updateTags.error && <span className="text-xs text-red-500">{(updateTags.error as Error).message}</span>}
                  <button onClick={() => setEditingTags(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  <button onClick={() => updateTags.mutate(tagsDraft)} disabled={updateTags.isPending}
                    className="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 font-medium">
                    {updateTags.isPending ? 'Saving…' : 'Save tags'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {lecture.tags?.map((tag) => (
                  <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">{tag}</span>
                ))}
                <button onClick={startEditingTags} className="text-xs text-gray-400 hover:text-indigo-500 transition-colors">
                  {lecture.tags?.length > 0 ? 'Edit tags' : '+ Add tags'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Content card */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-1 pt-1 gap-1">
            <button onClick={() => setTab('flashcards')}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${tab === 'flashcards' ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}>
              Flashcards ({lecture.flashcards.length})
            </button>
            <button onClick={() => setTab('notes')}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${tab === 'notes' ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}>
              Notes
            </button>
            {lecture.transcript && (
              <button onClick={() => setTab('transcript')}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${tab === 'transcript' ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'}`}>
                Transcript
              </button>
            )}
          </div>

          <div className="p-5">
            {/* Regenerate alert */}
            {updateTranscript.isSuccess && !editingTranscript && (
              regenerate.isSuccess ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
                  <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-xs text-green-700 font-medium">Notes and flashcards regenerated.</p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-amber-800 font-medium">Transcript updated — regenerate notes and flashcards to match?</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {regenerate.error && <span className="text-xs text-red-500">{(regenerate.error as Error).message}</span>}
                    <button onClick={() => regenerate.mutate()} disabled={regenerate.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors font-medium">
                      {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Flashcards */}
            {tab === 'flashcards' && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      setAnkiExporting(true)
                      try { await downloadFile(`/api/lectures/${lectureId}/anki/`, `${lecture.title}.apkg`) }
                      catch (e) { alert((e as Error).message) }
                      finally { setAnkiExporting(false) }
                    }}
                    disabled={ankiExporting}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium">
                    {ankiExporting ? 'Exporting…' : 'Export to Anki'}
                  </button>
                </div>
                {lecture.flashcards.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No flashcards yet.</p>
                ) : (
                  <>
                    <FlashCard
                      front={lecture.flashcards[safeIdx].front}
                      back={lecture.flashcards[safeIdx].back}
                      index={cardIndex}
                      total={lecture.flashcards.length}
                      flipped={cardFlipped}
                      onFlip={() => setCardFlipped(!cardFlipped)}
                    />
                    {/* Delete current card */}
                    <div className="flex items-center justify-center">
                      {confirmDeleteCard ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Delete this card?</span>
                          <button
                            onClick={() => {
                              const id = lecture.flashcards[safeIdx].id
                              deleteFlashcard.mutate(id, {
                                onSuccess: () => {
                                  setConfirmDeleteCard(false)
                                  setCardIndex((i) => Math.max(0, i - 1))
                                }
                              })
                            }}
                            className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
                          <button onClick={() => setConfirmDeleteCard(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteCard(true)}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors">
                          Delete this card
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => goToCard(Math.max(0, cardIndex - 1))} disabled={cardIndex === 0}
                        className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors">← Prev</button>
                      <button onClick={() => goToCard(Math.min(lecture.flashcards.length - 1, cardIndex + 1))} disabled={cardIndex === lecture.flashcards.length - 1}
                        className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors">Next →</button>
                    </div>
                    <p className="text-xs text-gray-400 text-center">Arrow keys to navigate · Space to flip</p>
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            {tab === 'notes' && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-end gap-2">
                  {editingNotes ? (
                    <>
                      {updateNotes.error && <span className="text-xs text-red-500">{(updateNotes.error as Error).message}</span>}
                      <button onClick={() => { setEditingNotes(false); updateNotes.reset() }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
                      <button onClick={() => updateNotes.mutate(notesDraft)} disabled={updateNotes.isPending}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
                        {updateNotes.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={triggerPrint} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">Export PDF</button>
                      <button onClick={copyNotes} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
                        {copied ? 'Copied!' : 'Copy notes'}
                      </button>
                      <button onClick={() => { setNotesDraft(lecture.notes); setEditingNotes(true) }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">Edit</button>
                    </>
                  )}
                </div>
                {editingNotes ? (
                  <textarea autoFocus
                    className="w-full bg-[#fafafa] rounded-xl p-4 text-sm text-gray-700 leading-relaxed font-mono resize-none outline-none focus:ring-2 focus:ring-indigo-200 border border-indigo-200"
                    rows={20} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                ) : (
                  <div className="bg-[#fafafa] rounded-xl p-5">
                    <NotesViewer notes={lecture.notes} />
                  </div>
                )}
              </div>
            )}
            {printPortal}

            {/* Transcript */}
            {tab === 'transcript' && lecture.transcript && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-end">
                  {editingTranscript ? (
                    <div className="flex items-center gap-2">
                      {updateTranscript.error && <span className="text-xs text-red-500">{(updateTranscript.error as Error).message}</span>}
                      <button onClick={() => { setEditingTranscript(false); updateTranscript.reset() }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
                      <button onClick={() => updateTranscript.mutate(transcriptDraft)} disabled={updateTranscript.isPending}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
                        {updateTranscript.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setTranscriptDraft(lecture.transcript); setEditingTranscript(true); updateTranscript.reset() }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">Edit</button>
                  )}
                </div>
                {editingTranscript ? (
                  <textarea autoFocus
                    className="w-full bg-[#fafafa] rounded-xl p-4 max-h-96 text-sm text-gray-700 leading-relaxed font-mono resize-none outline-none focus:ring-2 focus:ring-indigo-200 border border-indigo-200 overflow-y-auto"
                    rows={12} value={transcriptDraft} onChange={(e) => setTranscriptDraft(e.target.value)} />
                ) : (
                  <div className="bg-[#fafafa] rounded-xl p-4 max-h-96 overflow-y-auto">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">{lecture.transcript}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Prev / Next lecture navigation */}
        {(prevId !== null || nextId !== null) && (
          <div className="flex gap-3 pb-16">
            {prevId !== null ? (
              <Link to="/lectures/$lectureId" params={{ lectureId: String(prevId) }}
                className="flex-1 py-2.5 text-sm text-indigo-500 hover:text-indigo-700 font-medium transition-colors">← Prev lecture</Link>
            ) : <div className="flex-1" />}
            {nextId !== null ? (
              <Link to="/lectures/$lectureId" params={{ lectureId: String(nextId) }}
                className="flex-1 py-2.5 text-sm text-right text-indigo-500 hover:text-indigo-700 font-medium transition-colors">Next lecture →</Link>
            ) : <div className="flex-1" />}
          </div>
        )}
        {!prevId && !nextId && <div className="pb-16" />}
      </div>

      {showAppend && <AppendModal lectureId={lectureId} onClose={() => setShowAppend(false)} />}
    </div>
  )
}
