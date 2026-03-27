import { useState, useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type LectureListItem, type LectureFolder } from '../api'
import UserMenu from '../components/UserMenu'
import CourseChat from '../components/CourseChat'

interface Props {
  courseId: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function LectureCard({ lecture, courseId, folders, movingId, setMovingId }: {
  lecture: LectureListItem
  courseId: number
  folders: LectureFolder[]
  movingId: number | null
  setMovingId: (id: number | null) => void
}) {
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const del = useMutation({
    mutationFn: () => api.lectures.delete(lecture.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
  })

  const move = useMutation({
    mutationFn: (folder_id: number | null) => api.lectures.update(lecture.id, { folder_id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', courseId] }); setMovingId(null) },
  })

  return (
    <div className="relative group">
      <div className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 px-5 py-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
        <Link to="/lectures/$lectureId" params={{ lectureId: String(lecture.id) }} className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{lecture.title}</h3>
          {lecture.summary && <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{lecture.summary}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{formatDate(lecture.created_at)}</span>
            <span>·</span>
            <span>{lecture.flashcard_count} flashcard{lecture.flashcard_count !== 1 ? 's' : ''}</span>
          </div>
          {lecture.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lecture.tags.map((tag) => (
                <Link key={tag} to="/courses/$courseId/topics/$tag" params={{ courseId: String(courseId), tag }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {folders.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setMovingId(movingId === lecture.id ? null : lecture.id) }}
              className="p-1.5 text-gray-300 hover:text-indigo-500 transition-colors rounded-lg hover:bg-indigo-50" title="Move to folder">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Delete?</span>
              <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none" title="Delete lecture">×</button>
          )}
        </div>
      </div>
      {movingId === lecture.id && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-40">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-1.5 pb-1">Move to folder</p>
          {lecture.folder_id !== null && (
            <button onClick={() => move.mutate(null)} className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">No folder</button>
          )}
          {folders.map((f) => (
            <button key={f.id} onClick={() => move.mutate(f.id)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 ${lecture.folder_id === f.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}>
              📁 {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LectureFolderSection({ folder, lectures, courseId, folders, movingId, setMovingId }: {
  folder: LectureFolder
  lectures: LectureListItem[]
  courseId: number
  folders: LectureFolder[]
  movingId: number | null
  setMovingId: (id: number | null) => void
}) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const del = useMutation({
    mutationFn: () => api.lectureFolders.delete(folder.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
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
          <span className="text-xs text-gray-300">{lectures.length}</span>
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
          {lectures.map((l) => (
            <LectureCard key={l.id} lecture={l} courseId={courseId} folders={folders} movingId={movingId} setMovingId={setMovingId} />
          ))}
          {lectures.length === 0 && <p className="text-xs text-gray-400 py-2">No lectures in this folder.</p>}
        </div>
      )}
    </div>
  )
}

function NewLectureFolderModal({ courseId, onClose }: { courseId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: (body: { name: string }) => api.lectureFolders.create(courseId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', courseId] }); onClose() },
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900">New Folder</h2>
        <input autoFocus
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="e.g. Week 1, Midterm prep…"
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

export default function CourseDetailPage({ courseId }: Props) {
  const navigate = useNavigate()
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [movingId, setMovingId] = useState<number | null>(null)

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api.courses.get(courseId),
  })

  const del = useMutation({
    mutationFn: () => api.courses.delete(courseId),
    onSuccess: () => { navigate({ to: '/courses' }) },
  })

  // Must be before early returns — Rules of Hooks
  const { folderLectureMap, unfolderedLectures } = useMemo(() => {
    const folderLectureMap: Record<number, LectureListItem[]> = {}
    const unfolderedLectures: LectureListItem[] = []
    for (const l of course?.lectures ?? []) {
      if (l.folder_id != null) {
        folderLectureMap[l.folder_id] = [...(folderLectureMap[l.folder_id] ?? []), l]
      } else {
        unfolderedLectures.push(l)
      }
    }
    return { folderLectureMap, unfolderedLectures }
  }, [course?.lectures])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Course not found.</p>
          <Link to="/courses" className="text-indigo-500 text-sm mt-2 inline-block hover:text-indigo-700">← Back to courses</Link>
        </div>
      </div>
    )
  }

  const allTags = [...new Set(course.lectures.flatMap((l) => l.tags ?? []))]
  const scoreMap = Object.fromEntries((course.exam_scores ?? []).map((e) => [e.tag, e]))
  const lectureFolders = course.lecture_folders ?? []

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
  const weakTags = allTags.filter((tag) => { const pct = scorePct(tag); return pct != null && pct < 70 })
    .sort((a, b) => (scorePct(a) ?? 0) - (scorePct(b) ?? 0))

  return (
    <>
      <div className="min-h-screen bg-[#fafafa]" onClick={() => setMovingId(null)}>
        {/* Nav */}
        <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100 px-5 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/courses" className="text-sm font-medium text-indigo-500 hover:text-indigo-700 transition-colors">← My Courses</Link>
          <div className="flex items-center gap-2">
            <button onClick={() => window.dispatchEvent(new CustomEvent('graspit:search', { detail: { courseId: course.id, courseName: course.name } }))}
              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-gray-50" title="Search this course (⌘K)">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <button onClick={() => setChatOpen(true)} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-gray-50" title="Ask your lectures (AI)">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowNewFolder(true) }}
              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-gray-50" title="New folder">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </button>
            <Link to="/record" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:block">New Lecture</span>
            </Link>
            <UserMenu />
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-5 sm:px-6">
          {/* Course header */}
          <section className="pt-10 pb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0" style={{ background: course.color }}>
                  {course.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{course.name}</h1>
                  {course.description && <p className="text-sm text-gray-400 mt-0.5">{course.description}</p>}
                </div>
              </div>
              {confirmDeleteCourse ? (
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  <span className="text-xs text-gray-400">Delete course?</span>
                  <button onClick={() => del.mutate()} className="text-xs text-red-500 font-semibold hover:text-red-700">Delete</button>
                  <button onClick={() => setConfirmDeleteCourse(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteCourse(true)} className="p-2 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 shrink-0 mt-0.5" title="Delete course">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-8 pb-16">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl px-4 py-4 border border-gray-100 text-center">
                <p className="text-2xl font-bold text-gray-900">{course.lectures.length}</p>
                <p className="text-xs text-gray-400 mt-1">Lectures</p>
              </div>
              <div className="bg-white rounded-2xl px-4 py-4 border border-gray-100 text-center">
                <p className="text-2xl font-bold text-gray-900">{course.lectures.reduce((sum, l) => sum + l.flashcard_count, 0)}</p>
                <p className="text-xs text-gray-400 mt-1">Flashcards</p>
              </div>
              {allTags.length > 0 && (
                <div className="bg-white rounded-2xl px-4 py-4 border border-gray-100 text-center">
                  <p className="text-2xl font-bold text-gray-900">{allTags.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Topics</p>
                </div>
              )}
              {avgPct !== null && (
                <div className="bg-white rounded-2xl px-4 py-4 border border-gray-100 text-center">
                  <p className={`text-2xl font-bold ${avgPct >= 70 ? 'text-green-600' : avgPct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{avgPct}%</p>
                  <p className="text-xs text-gray-400 mt-1">Avg score</p>
                </div>
              )}
            </div>

            {/* Topics */}
            {allTags.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Topics</h2>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <Link key={tag} to="/courses/$courseId/topics/$tag" params={{ courseId: String(courseId), tag }}
                      className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-full border border-indigo-100 bg-white text-indigo-600 font-medium hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors">
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
                    <Link key={tag} to="/courses/$courseId/topics/$tag" params={{ courseId: String(courseId), tag }}
                      className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-red-100 hover:border-red-300 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-2">
                        {scoreBadge(tag)}
                        <span className="text-sm font-medium text-gray-700">{tag}</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Lectures */}
            {course.lectures.length > 0 ? (
              <div className="flex flex-col gap-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lectures</h2>
                {/* Folders */}
                {lectureFolders.map((folder) => (
                  <LectureFolderSection
                    key={folder.id}
                    folder={folder}
                    lectures={folderLectureMap[folder.id] ?? []}
                    courseId={courseId}
                    folders={lectureFolders}
                    movingId={movingId}
                    setMovingId={setMovingId}
                  />
                ))}
                {/* Unfoldered */}
                {unfolderedLectures.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {lectureFolders.length > 0 && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Other</p>
                    )}
                    {unfolderedLectures.map((l) => (
                      <LectureCard key={l.id} lecture={l} courseId={courseId} folders={lectureFolders} movingId={movingId} setMovingId={setMovingId} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800 mb-1">No lectures yet</h3>
                  <p className="text-sm text-gray-400">Record a lecture and save it to this course.</p>
                </div>
                <Link to="/record" className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                  Record your first lecture
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {chatOpen && <CourseChat courseId={courseId} courseName={course.name} onClose={() => setChatOpen(false)} />}
      {showNewFolder && <NewLectureFolderModal courseId={courseId} onClose={() => setShowNewFolder(false)} />}
    </>
  )
}
