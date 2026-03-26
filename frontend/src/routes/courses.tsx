import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CourseListItem } from '../api'
import UserMenu from '../components/UserMenu'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function NewCourseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])

  const create = useMutation({
    mutationFn: api.courses.create,
    onSuccess: (course) => {
      qc.invalidateQueries({ queryKey: ['courses'] })
      navigate({ to: '/courses/$courseId', params: { courseId: String(course.id) } })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900">New Course</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</label>
          <input
            autoFocus
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. Biochemistry II"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate({ name: name.trim(), description, color })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description (optional)</label>
          <input
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. Semester 2 lectures and labs"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{ background: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
        </div>

        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}

        <div className="flex gap-3 mt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && create.mutate({ name: name.trim(), description, color })}
            disabled={!name.trim() || create.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CourseCard({ course }: { course: CourseListItem }) {
  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: String(course.id) }}
      className="group flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div
        className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm"
        style={{ background: course.color }}
      >
        {course.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 truncate transition-colors">
          {course.name}
        </p>
        {course.description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{course.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-400">
          {course.lecture_count} {course.lecture_count === 1 ? 'lecture' : 'lectures'}
        </span>
        <span className="text-xs text-gray-300">{timeAgo(course.updated_at)}</span>
        <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

export default function CoursesPage() {
  const [showNew, setShowNew] = useState(false)
  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: api.courses.list,
  })

  const visibleCourses = courses?.filter((c) => c.name !== 'Miscellaneous') ?? []

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
          ← Home
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('brainjam:search'))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors shadow-sm"
            title="Search (⌘K)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <span className="hidden sm:block text-xs">Search</span>
            <kbd className="hidden sm:block text-[10px] border border-gray-200 rounded px-1 font-sans leading-tight">⌘K</kbd>
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:block">New Course</span>
          </button>
          <UserMenu />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 sm:px-6">
        {/* Page header */}
        <section className="pt-10 pb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">My Courses</h1>
        </section>

        {/* Course list */}
        <div className="pb-16">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-white border border-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : visibleCourses.length > 0 ? (
            <div className="flex flex-col gap-2">
              {visibleCourses.map((c) => <CourseCard key={c.id} course={c} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 mb-1">No courses yet</h3>
                <p className="text-sm text-gray-400">Welcome to BrainJam! Create your first course to start organising your lectures.</p>
              </div>
              <button
                onClick={() => setShowNew(true)}
                className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Create your first course
              </button>
            </div>
          )}
        </div>
      </div>

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
