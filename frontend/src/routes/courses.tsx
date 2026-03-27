import { useState, useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CourseListItem, type CourseFolder } from '../api'
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
      navigate({ to: '/courses/$courseId', params: { courseId: String(course.id) } })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
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
              <button key={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{ background: c, outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <div className="flex gap-3 mt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => name.trim() && create.mutate({ name: name.trim(), description, color })} disabled={!name.trim() || create.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewFolderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: api.courseFolders.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900">New Folder</h2>
        <input
          autoFocus
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="e.g. Year 1, Semester 2…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate({ name: name.trim() })}
        />
        {create.error && <p className="text-sm text-red-600">{(create.error as Error).message}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => name.trim() && create.mutate({ name: name.trim() })} disabled={!name.trim() || create.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CourseCard({ course, folders, movingId, setMovingId }: {
  course: CourseListItem
  folders: CourseFolder[]
  movingId: number | null
  setMovingId: (id: number | null) => void
}) {
  const qc = useQueryClient()
  const move = useMutation({
    mutationFn: (folder_id: number | null) => api.courses.update(course.id, { folder_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); setMovingId(null) },
  })

  return (
    <div className="relative group">
      <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <Link to="/courses/$courseId" params={{ courseId: String(course.id) }} className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm" style={{ background: course.color }}>
            {course.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 truncate transition-colors">{course.name}</p>
            {course.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{course.description}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-400">{course.lecture_count} {course.lecture_count === 1 ? 'lecture' : 'lectures'}</span>
            <span className="text-xs text-gray-300">{timeAgo(course.updated_at)}</span>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        {folders.length > 0 && (
          <button
            onClick={() => setMovingId(movingId === course.id ? null : course.id)}
            className="shrink-0 p-1.5 text-gray-300 hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-50"
            title="Move to folder"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </button>
        )}
      </div>
      {movingId === course.id && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-40">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-1.5 pb-1">Move to folder</p>
          {course.folder_id !== null && (
            <button onClick={() => move.mutate(null)} className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              No folder
            </button>
          )}
          {folders.map((f) => (
            <button key={f.id} onClick={() => move.mutate(f.id)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 ${course.folder_id === f.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}>
              📁 {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FolderSection({ folder, courses, folders, movingId, setMovingId }: {
  folder: CourseFolder
  courses: CourseListItem[]
  folders: CourseFolder[]
  movingId: number | null
  setMovingId: (id: number | null) => void
}) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const del = useMutation({
    mutationFn: () => api.courseFolders.delete(folder.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 min-w-0 group">
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 group-hover:text-gray-700 transition-colors">
            📁 {folder.name}
          </span>
          <span className="text-xs text-gray-300">{courses.length}</span>
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400">Delete folder?</span>
            <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none" title="Delete folder">×</button>
        )}
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-2 pl-5 border-l-2 border-gray-100">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} folders={folders} movingId={movingId} setMovingId={setMovingId} />
          ))}
          {courses.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No courses in this folder.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CoursesPage() {
  const [showNew, setShowNew] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [movingId, setMovingId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: api.courses.list,
  })

  const courses = data?.courses ?? []
  const folders = data?.folders ?? []
  const visibleCourses = courses.filter((c) => c.name !== 'Miscellaneous')

  const { folderMap, unfoldered } = useMemo(() => {
    const folderMap: Record<number, CourseListItem[]> = {}
    const unfoldered: CourseListItem[] = []
    for (const c of visibleCourses) {
      if (c.folder_id != null) {
        folderMap[c.folder_id] = [...(folderMap[c.folder_id] ?? []), c]
      } else {
        unfoldered.push(c)
      }
    }
    return { folderMap, unfoldered }
  }, [visibleCourses])

  return (
    <div className="min-h-screen bg-[#fafafa]" onClick={() => setMovingId(null)}>
      {/* Nav */}
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">
          ← Home
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('graspit:search')) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors shadow-sm"
            title="Search (⌘K)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <span className="hidden sm:block text-xs">Search</span>
            <kbd className="hidden sm:block text-[10px] border border-gray-200 rounded px-1 font-sans leading-tight">⌘K</kbd>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowNewFolder(true) }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span className="hidden sm:block">New Folder</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowNew(true) }}
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
        <section className="pt-10 pb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">My Courses</h1>
        </section>

        <div className="pb-16">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white border border-gray-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : visibleCourses.length > 0 ? (
            <div className="flex flex-col gap-6">
              {/* Folders */}
              {folders.map((folder) => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  courses={folderMap[folder.id] ?? []}
                  folders={folders}
                  movingId={movingId}
                  setMovingId={setMovingId}
                />
              ))}
              {/* Unfoldered */}
              {unfoldered.length > 0 && (
                <div className="flex flex-col gap-2">
                  {folders.length > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Other</p>
                  )}
                  {unfoldered.map((c) => (
                    <CourseCard key={c.id} course={c} folders={folders} movingId={movingId} setMovingId={setMovingId} />
                  ))}
                </div>
              )}
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
              <button onClick={() => setShowNew(true)} className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                Create your first course
              </button>
            </div>
          )}
        </div>
      </div>

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} />}
    </div>
  )
}
