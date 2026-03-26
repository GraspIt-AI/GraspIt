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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900">New Course</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</label>
          <input
            autoFocus
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. Biochemistry II"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate({ name: name.trim(), description, color })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description (optional)</label>
          <input
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. Semester 2 lectures and labs"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {create.error && (
          <p className="text-sm text-red-600">{(create.error as Error).message}</p>
        )}

        <div className="flex gap-3 mt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && create.mutate({ name: name.trim(), description, color })}
            disabled={!name.trim() || create.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
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
      className="group flex flex-col gap-3 bg-white rounded-2xl shadow-sm hover:shadow-md border border-gray-100 p-5 transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-lg"
          style={{ background: course.color }}
        >
          {course.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors truncate">
            {course.name}
          </h3>
          {course.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{course.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {course.lecture_count} {course.lecture_count === 1 ? 'lecture' : 'lectures'}
        </span>
        <span>{timeAgo(course.updated_at)}</span>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 px-4 py-12">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
              ← Record
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">My Courses</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('brainjam:search'))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors shadow-sm"
              title="Search (⌘K)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <span className="hidden sm:block text-xs">Search</span>
              <kbd className="hidden sm:block text-[10px] border border-gray-200 rounded px-1 font-sans leading-tight">⌘K</kbd>
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md"
            >
              + New Course
            </button>
            <UserMenu />
          </div>
        </div>

        {/* Course grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-28 animate-pulse" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-3xl">📚</div>
            <h2 className="text-xl font-bold text-gray-800">No courses yet</h2>
            <p className="text-sm text-gray-500">Welcome to BrainJam! Create your first course to start organising your lectures.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
            >
              Create your first course
            </button>
          </div>
        )}
      </div>

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
