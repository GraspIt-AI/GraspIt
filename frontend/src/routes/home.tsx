import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CourseListItem, type RecentLecture } from '../api'
import UserMenu from '../components/UserMenu'
import { getAuthUser } from '../authStore'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900">New Course</h2>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</label>
          <input
            autoFocus
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. Biochemistry II"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && name.trim() && create.mutate({ name: name.trim(), description, color })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Description (optional)
          </label>
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
                style={{
                  background: c,
                  outline: color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}

        <div className="flex gap-3 mt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
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

function RecentLectureCard({ lecture }: { lecture: RecentLecture }) {
  return (
    <Link
      to="/lectures/$lectureId"
      params={{ lectureId: String(lecture.id) }}
      className="group flex flex-col gap-3 bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: lecture.course_color }} />
        <span className="text-xs text-gray-400 truncate">{lecture.course_name}</span>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 line-clamp-2 leading-snug transition-colors flex-1">
        {lecture.title}
      </h3>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{timeAgo(lecture.created_at)}</span>
        <span className="text-xs text-gray-300">{lecture.flashcard_count} cards</span>
      </div>
    </Link>
  )
}

function CourseRow({ course }: { course: CourseListItem }) {
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
        <p className="text-xs text-gray-400 mt-0.5">
          {course.lecture_count} {course.lecture_count === 1 ? 'lecture' : 'lectures'}
        </p>
      </div>
      <svg
        className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function HomePage() {
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()
  const user = getAuthUser()

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: api.courses.list,
  })

  const { data: recentLectures } = useQuery({
    queryKey: ['lectures', 'recent'],
    queryFn: api.lectures.recent,
  })

  const hasRecentLectures = recentLectures && recentLectures.length > 0
  const visibleCourses = courses?.filter((c) => c.name !== 'Miscellaneous') ?? []

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 h-14 flex items-center justify-between">
        <span className="text-base font-bold text-gray-900 tracking-tight">GraspIt</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('graspit:search'))}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors shadow-sm"
            title="Search (⌘K)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <span className="hidden sm:block text-xs">Search</span>
            <kbd className="hidden sm:block text-[10px] border border-gray-200 rounded px-1 font-sans leading-tight">
              ⌘K
            </kbd>
          </button>
          <UserMenu />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-5 sm:px-6">
        {/* Hero */}
        <section className="pt-14 pb-10">
          <p className="text-sm font-semibold text-indigo-500 tracking-wide mb-2">{greeting()}</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-3">
            {user?.username ?? 'Welcome back'}.
          </h1>
          <p className="text-lg text-gray-400 mb-10">What are you learning today?</p>

          {/* Primary CTA */}
          <button
            onClick={() => navigate({ to: '/record' })}
            className="w-full flex items-center justify-between px-6 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-violet-700 transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-base font-bold leading-tight">Start a new lecture</div>
                <div className="text-sm text-white/60 mt-0.5">Record, upload, or snap a photo</div>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-white/60 group-hover:translate-x-1 transition-transform shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </section>

        {/* Recent lectures */}
        {hasRecentLectures && (
          <section className="pb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">Recently saved</h2>
              <Link to="/courses" className="text-sm text-indigo-500 hover:text-indigo-700 transition-colors">
                See all
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentLectures.map((lecture) => (
                <RecentLectureCard key={lecture.id} lecture={lecture} />
              ))}
            </div>
          </section>
        )}

        {/* Courses */}
        <section className="pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">Courses</h2>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Course
            </button>
          </div>

          {coursesLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-white border border-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : visibleCourses.length > 0 ? (
            <div className="flex flex-col gap-2">
              {visibleCourses.map((c) => (
                <CourseRow key={c.id} course={c} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 mb-1">No courses yet</h3>
                <p className="text-sm text-gray-400">Create a course to organise your lectures.</p>
              </div>
              <button
                onClick={() => setShowNew(true)}
                className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Create your first course
              </button>
            </div>
          )}
        </section>
      </div>

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
