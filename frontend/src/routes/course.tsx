import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type LectureListItem } from '../api'
import CourseChat from '../components/CourseChat'

interface Props {
  courseId: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function LectureCard({ lecture, courseId }: { lecture: LectureListItem; courseId: number }) {
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const del = useMutation({
    mutationFn: () => api.lectures.delete(lecture.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
  })

  return (
    <div className="group flex items-start gap-4 bg-white rounded-2xl border border-gray-100 px-5 py-4 hover:shadow-md transition-all">
      <Link
        to="/lectures/$lectureId"
        params={{ lectureId: String(lecture.id) }}
        className="flex-1 min-w-0"
      >
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
          {lecture.title}
        </h3>
        {lecture.summary && (
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{lecture.summary}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          <span>{formatDate(lecture.created_at)}</span>
          <span>·</span>
          <span>{lecture.flashcard_count} flashcard{lecture.flashcard_count !== 1 ? 's' : ''}</span>
        </div>
        {lecture.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lecture.tags.map((tag) => (
              <Link
                key={tag}
                to="/courses/$courseId/topics/$tag"
                params={{ courseId: String(courseId), tag }}
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}
      </Link>
      {confirmDelete ? (
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-xs text-gray-500">Are you sure?</span>
          <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-lg leading-none mt-0.5"
          title="Delete lecture"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function CourseDetailPage({ courseId }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api.courses.get(courseId),
  })

  const del = useMutation({
    mutationFn: () => api.courses.delete(courseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['courses'] })
      navigate({ to: '/courses' })
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Course not found.</p>
          <Link to="/courses" className="text-indigo-600 text-sm mt-2 inline-block">← Back to courses</Link>
        </div>
      </div>
    )
  }

  const allTags = [...new Set(course.lectures.flatMap((l) => l.tags ?? []))]
  const scoreMap = Object.fromEntries((course.exam_scores ?? []).map((e) => [e.tag, e]))

  function scorePct(tag: string) {
    const s = scoreMap[tag]
    if (!s || s.last_score == null || !s.last_total) return null
    return Math.round((s.last_score / s.last_total) * 100)
  }

  function scoreBadge(tag: string) {
    const pct = scorePct(tag)
    if (pct == null) return null
    const color = pct >= 70 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
    const s = scoreMap[tag]
    return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{s!.last_score}/{s!.last_total}</span>
  }

  const attemptedScores = (course.exam_scores ?? []).filter((e) => e.last_score != null && e.last_total)
  const avgPct = attemptedScores.length
    ? Math.round(attemptedScores.reduce((sum, e) => sum + (e.last_score! / e.last_total!) * 100, 0) / attemptedScores.length)
    : null

  const weakTags = allTags
    .filter((tag) => { const pct = scorePct(tag); return pct != null && pct < 70 })
    .sort((a, b) => (scorePct(a) ?? 0) - (scorePct(b) ?? 0))

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div>
          <Link to="/courses" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
            ← My Courses
          </Link>
          <div className="flex items-start justify-between mt-2 gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0"
                style={{ background: course.color }}
              >
                {course.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
                {course.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{course.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setChatOpen(true)}
                className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                title="Ask your lectures (AI)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('brainjam:search', { detail: { courseId: course.id, courseName: course.name } }))}
                className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                title="Search this course (⌘K)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                </svg>
              </button>
              <Link
                to="/"
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                + Record Lecture
              </Link>
              {confirmDeleteCourse ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Delete course?</span>
                  <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
                  <button onClick={() => setConfirmDeleteCourse(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteCourse(true)}
                  className="p-2 text-gray-300 hover:text-red-400 transition-colors"
                  title="Delete course"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="bg-white rounded-2xl px-5 py-3 border border-gray-100 text-center flex-1">
            <p className="text-2xl font-bold text-gray-900">{course.lectures.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Lectures</p>
          </div>
          <div className="bg-white rounded-2xl px-5 py-3 border border-gray-100 text-center flex-1">
            <p className="text-2xl font-bold text-gray-900">
              {course.lectures.reduce((sum, l) => sum + l.flashcard_count, 0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Flashcards</p>
          </div>
          {allTags.length > 0 && (
            <div className="bg-white rounded-2xl px-5 py-3 border border-gray-100 text-center flex-1">
              <p className="text-2xl font-bold text-gray-900">{allTags.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Topics</p>
            </div>
          )}
          {avgPct !== null && (
            <div className="bg-white rounded-2xl px-5 py-3 border border-gray-100 text-center flex-1">
              <p className={`text-2xl font-bold ${avgPct >= 70 ? 'text-green-600' : avgPct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {avgPct}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Avg score</p>
            </div>
          )}
        </div>

        {/* Topics */}
        {allTags.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Topics</h2>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Link
                  key={tag}
                  to="/courses/$courseId/topics/$tag"
                  params={{ courseId: String(courseId), tag }}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-indigo-200 bg-white text-indigo-700 font-medium hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors"
                >
                  {tag}
                  {scoreBadge(tag) && <span onClick={(e) => e.preventDefault()}>{scoreBadge(tag)}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Needs Review */}
        {weakTags.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400">Needs Review</h2>
            <div className="flex flex-col gap-2">
              {weakTags.map((tag) => (
                <Link
                  key={tag}
                  to="/courses/$courseId/topics/$tag"
                  params={{ courseId: String(courseId), tag }}
                  className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-red-100 hover:border-red-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    {scoreBadge(tag)}
                    <span className="text-sm font-medium text-gray-700">{tag}</span>
                  </div>
                  <span className="text-gray-400 text-sm">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Lectures list */}
        {course.lectures.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lectures</h2>
            {course.lectures.map((l) => (
              <LectureCard key={l.id} lecture={l} courseId={courseId} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-2xl">🎙️</div>
            <h2 className="text-lg font-bold text-gray-800">No lectures yet</h2>
            <p className="text-sm text-gray-500">Record a lecture and save it to this course.</p>
            <Link
              to="/"
              className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
            >
              Record your first lecture
            </Link>
          </div>
        )}
      </div>
    </div>
    {chatOpen && (
      <CourseChat courseId={courseId} courseName={course.name} onClose={() => setChatOpen(false)} />
    )}
    </>
  )
}
