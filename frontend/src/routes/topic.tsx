import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, downloadFile, type ExamQuestion } from '../api'
import FlashCard from '../components/FlashCard'
import NotesViewer from '../components/NotesViewer'
import { usePrintNotes } from '../usePrintNotes'

interface Props {
  courseId: number
  tag: string
}

// ── Inline exam flow ───────────────────────────────────────────────────────────

function ExamFlow({ questions, onRetry, onComplete }: { questions: ExamQuestion[]; onRetry: () => void; onComplete: (score: number, total: number) => void }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(boolean | null)[]>(Array(questions.length).fill(null))
  const [done, setDone] = useState(false)
  // MCQ state
  const [mcqSelected, setMcqSelected] = useState<number | null>(null)
  // Numeric state
  const [numericInput, setNumericInput] = useState('')
  const [numericRevealed, setNumericRevealed] = useState(false)

  const q = questions[index]
  const score = answers.filter(Boolean).length

  function advance(correct: boolean) {
    const na = [...answers]; na[index] = correct; setAnswers(na)
    if (index < questions.length - 1) {
      setIndex((i) => i + 1)
      setMcqSelected(null)
      setNumericInput('')
      setNumericRevealed(false)
    } else {
      const finalScore = na.filter(Boolean).length
      setDone(true)
      onComplete(finalScore, questions.length)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center text-4xl">
          {score === questions.length ? '🎉' : score >= questions.length * 0.7 ? '👏' : '📚'}
        </div>
        <div>
          <p className="text-4xl font-bold text-gray-900">{score} / {questions.length}</p>
          <p className="text-base text-gray-500 mt-1">
            {score === questions.length ? 'Perfect score!' : score >= questions.length * 0.7 ? 'Good job! Review the ones you missed.' : "Keep studying — you'll get there!"}
          </p>
        </div>
        <div className="w-full flex flex-col gap-2 text-left mt-2">
          {questions.map((q, i) => {
            const isCorrect = answers[i] === true
            return (
              <div key={i} className={`rounded-xl px-4 py-3 border text-sm ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>{isCorrect ? '✓' : '✗'}</span>
                  <p className="text-gray-800 font-medium">{q.question}</p>
                </div>
                {!isCorrect && (
                  <p className="text-xs text-gray-500 mt-1.5 ml-5 line-clamp-3">
                    {q.type === 'mcq'
                      ? <>Correct: <span className="font-medium text-green-700">{q.options[q.correct]}</span></>
                      : <>{q.type === 'numeric' ? 'Answer: ' : 'Model answer: '}<span className="font-medium text-green-700">{q.answer}</span></>
                    }
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={onRetry} className="mt-2 px-6 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
          <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>
        <span className="text-xs text-gray-400 font-medium shrink-0">{index + 1} / {questions.length}</span>
      </div>

      {/* Question */}
      <div className="bg-gray-50 rounded-2xl p-5">
        <p className="text-base font-semibold text-gray-900 leading-snug">{q.question}</p>
      </div>

      {/* MCQ */}
      {q.type === 'mcq' && (() => {
        const answered = mcqSelected !== null
        return (
          <>
            <div className="flex flex-col gap-2">
              {q.options.map((opt, i) => {
                let cls = 'border border-gray-200 bg-white text-gray-800 hover:border-indigo-300 hover:bg-indigo-50'
                if (answered) {
                  if (i === q.correct) cls = 'border-2 border-green-400 bg-green-50 text-green-800'
                  else if (i === mcqSelected) cls = 'border-2 border-red-400 bg-red-50 text-red-800'
                  else cls = 'border border-gray-100 bg-gray-50 text-gray-400'
                } else if (mcqSelected === i) {
                  cls = 'border-2 border-indigo-400 bg-indigo-50 text-indigo-800'
                }
                return (
                  <button key={i} onClick={() => { if (!answered) setMcqSelected(i) }} disabled={answered}
                    className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${cls}`}>
                    {opt}
                  </button>
                )
              })}
            </div>
            {answered && mcqSelected !== q.correct && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Explanation</p>
                <p className="text-sm text-amber-900 leading-relaxed">{q.explanation}</p>
              </div>
            )}
            {answered && mcqSelected === q.correct && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-800 font-medium">Correct!</p>
              </div>
            )}
            {answered && (
              <button onClick={() => advance(mcqSelected === q.correct)}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">
                {index < questions.length - 1 ? 'Next question →' : 'See results'}
              </button>
            )}
          </>
        )
      })()}

      {/* Short answer */}
      {q.type === 'short_answer' && (
        <>
          {!numericRevealed ? (
            <>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-200"
                rows={4}
                placeholder="Write your answer here…"
                value={numericInput}
                onChange={(e) => setNumericInput(e.target.value)}
              />
              <button
                onClick={() => setNumericRevealed(true)}
                disabled={!numericInput.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                Submit & see model answer
              </button>
            </>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <p className="text-xs text-gray-400 font-medium mb-1">Your answer</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{numericInput}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1.5">Model answer</p>
                <p className="text-sm text-indigo-900 leading-relaxed">{q.answer}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => advance(false)}
                  className="flex-1 py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors">
                  ✗ Got it wrong
                </button>
                <button onClick={() => advance(true)}
                  className="flex-1 py-3 rounded-xl border border-green-200 text-green-700 font-semibold hover:bg-green-50 transition-colors">
                  ✓ Got it right
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Numeric */}
      {q.type === 'numeric' && (
        <>
          {!numericRevealed ? (
            <>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 font-mono resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-200"
                rows={3}
                placeholder="Work out your answer here…"
                value={numericInput}
                onChange={(e) => setNumericInput(e.target.value)}
              />
              <button
                onClick={() => setNumericRevealed(true)}
                disabled={!numericInput.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                Submit & reveal answer
              </button>
            </>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <p className="text-xs text-gray-400 font-medium mb-1">Your answer</p>
                <p className="text-sm text-gray-700 font-mono whitespace-pre-wrap">{numericInput}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Correct answer</p>
                <p className="text-sm font-semibold text-green-800">{q.answer}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Worked solution</p>
                <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{q.explanation}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => advance(false)}
                  className="flex-1 py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors">
                  ✗ Got it wrong
                </button>
                <button onClick={() => advance(true)}
                  className="flex-1 py-3 rounded-xl border border-green-200 text-green-700 font-semibold hover:bg-green-50 transition-colors">
                  ✓ Got it right
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TopicPage({ courseId, tag }: Props) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'flashcards' | 'notes' | 'exam'>('flashcards')
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[] | null>(null)
  const [examStale, setExamStale] = useState(false)
  const [ankiExporting, setAnkiExporting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['course-topic', courseId, tag],
    queryFn: () => api.courses.topic(courseId, tag),
  })

  // Load cached exam on mount
  const { data: cachedExam } = useQuery({
    queryKey: ['course-exam', courseId, tag],
    queryFn: () => api.courses.getExam(courseId, tag),
  })

  useEffect(() => {
    if (cachedExam?.found && cachedExam.questions) {
      setExamQuestions(normalizeQuestions(cachedExam.questions))
      setExamStale(cachedExam.stale ?? false)
    }
  }, [cachedExam])

  function normalizeQuestions(qs: ExamQuestion[]): ExamQuestion[] {
    return qs.map((q: any) => (q.type ? q : { ...q, type: 'mcq' })) as ExamQuestion[]
  }

  const examMutation = useMutation({
    mutationFn: () => api.courses.exam(courseId, tag),
    onSuccess: (res) => {
      setExamQuestions(normalizeQuestions(res.questions))
      setExamStale(false)
    },
  })

  const submitScore = useMutation({
    mutationFn: ({ score, total }: { score: number; total: number }) =>
      api.courses.submitScore(courseId, tag, score, total),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
  })

  const allFlashcards = data?.lectures.flatMap((l) =>
    l.flashcards.map((fc) => ({ ...fc, lectureTitle: l.title }))
  ) ?? []

  // Combined notes for print — each lecture's notes prefixed with a ## header
  const combinedNotes = (data?.lectures ?? [])
    .map((l) => `## ${l.title}\n\n${l.notes}`)
    .join('\n\n---\n\n')

  const { triggerPrint, printPortal } = usePrintNotes(tag, combinedNotes)

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (tab !== 'flashcards' || allFlashcards.length === 0) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCardIndex((i) => { const n = Math.min(allFlashcards.length - 1, i + 1); if (n !== i) setCardFlipped(false); return n })
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCardIndex((i) => { const n = Math.max(0, i - 1); if (n !== i) setCardFlipped(false); return n })
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setCardFlipped((f) => !f)
    }
  }, [tab, allFlashcards.length])

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

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Topic not found.</p>
          <Link to="/courses/$courseId" params={{ courseId: String(courseId) }} className="text-indigo-600 text-sm mt-2 inline-block">
            ← Back to course
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-8 flex flex-col gap-6">

        {/* Header */}
        <div>
          <Link
            to="/courses/$courseId"
            params={{ courseId: String(courseId) }}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            ← {data.course_name}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{tag}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.lectures.length} lecture{data.lectures.length !== 1 ? 's' : ''} · {allFlashcards.length} flashcards
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          <button
            onClick={() => setTab('flashcards')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'flashcards' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Flashcards ({allFlashcards.length})
          </button>
          <button
            onClick={() => setTab('notes')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'notes' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Notes
          </button>
          <button
            onClick={() => setTab('exam')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'exam' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Exam
          </button>
        </div>

        {/* Flashcards */}
        {tab === 'flashcards' && (
          allFlashcards.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No flashcards for this topic yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    setAnkiExporting(true)
                    try {
                      await downloadFile(
                        `/api/courses/${courseId}/anki/?tag=${encodeURIComponent(tag)}`,
                        `${tag}.apkg`
                      )
                    } catch (e) {
                      alert((e as Error).message)
                    } finally {
                      setAnkiExporting(false)
                    }
                  }}
                  disabled={ankiExporting}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium"
                >
                  {ankiExporting ? 'Exporting…' : 'Export to Anki'}
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                From: <span className="font-medium text-gray-600">{allFlashcards[cardIndex].lectureTitle}</span>
              </p>
              <FlashCard
                front={allFlashcards[cardIndex].front}
                back={allFlashcards[cardIndex].back}
                index={cardIndex}
                total={allFlashcards.length}
                flipped={cardFlipped}
                onFlip={() => setCardFlipped(!cardFlipped)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setCardIndex(Math.max(0, cardIndex - 1)); setCardFlipped(false) }}
                  disabled={cardIndex === 0}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => { setCardIndex(Math.min(allFlashcards.length - 1, cardIndex + 1)); setCardFlipped(false) }}
                  disabled={cardIndex === allFlashcards.length - 1}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">Arrow keys to navigate · Space to flip</p>
            </div>
          )
        )}

        {/* Notes */}
        {tab === 'notes' && (
          <div className="flex flex-col gap-5">
            <div className="flex justify-end">
              <button
                onClick={triggerPrint}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
              >
                Export PDF
              </button>
            </div>
            {data.lectures.map((lec) => (
              <div key={lec.id} className="flex flex-col gap-3">
                {/* Lecture source badge */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 shrink-0">
                    <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                    <span className="text-xs font-medium text-indigo-600">{lec.title}</span>
                  </div>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="bg-gray-50 rounded-2xl p-5">
                  <NotesViewer notes={lec.notes} />
                </div>
              </div>
            ))}
          </div>
        )}
        {printPortal}

        {/* Exam */}
        {tab === 'exam' && (
          examQuestions ? (
            <div className="flex flex-col gap-4">
              {examStale && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs text-amber-800 font-medium">New lectures added since this exam was generated.</p>
                    <button
                      onClick={() => examMutation.mutate()}
                      disabled={examMutation.isPending}
                      className="text-xs text-amber-700 underline hover:text-amber-900 mt-0.5 disabled:opacity-40"
                    >
                      {examMutation.isPending ? 'Regenerating…' : 'Regenerate with new content'}
                    </button>
                  </div>
                </div>
              )}
              <ExamFlow
                questions={examQuestions}
                onRetry={() => { setExamQuestions(null); setExamStale(false); examMutation.reset() }}
                onComplete={(score, total) => submitScore.mutate({ score, total })}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-3xl">📝</div>
              <div>
                <h3 className="font-bold text-gray-900">Topic Exam</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {data.lectures.length} lecture{data.lectures.length !== 1 ? 's' : ''} · 8–12 questions · MCQ, numerical & short answer
                </p>
              </div>
              {examMutation.error && (
                <p className="text-xs text-red-500">{(examMutation.error as Error).message}</p>
              )}
              <button
                onClick={() => examMutation.mutate()}
                disabled={examMutation.isPending}
                className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {examMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Generating exam…
                  </span>
                ) : 'Generate exam'}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
