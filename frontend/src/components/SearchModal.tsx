import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, type SearchResults } from '../api'

type FlatResult =
  | { type: 'topic'; tag: string; courseId: number; courseName: string; lectureCount: number }
  | { type: 'lecture'; id: number; title: string; summary: string; courseId: number; courseName: string; tags: string[] }
  | { type: 'flashcard'; id: number; front: string; back: string; lectureId: number; lectureTitle: string; courseId: number; courseName: string }

function flattenResults(data: SearchResults): FlatResult[] {
  const out: FlatResult[] = []
  for (const t of data.topics)
    out.push({ type: 'topic', tag: t.tag, courseId: t.course_id, courseName: t.course_name, lectureCount: t.lecture_count })
  for (const l of data.lectures)
    out.push({ type: 'lecture', id: l.id, title: l.title, summary: l.summary, courseId: l.course_id, courseName: l.course_name, tags: l.tags })
  for (const fc of data.flashcards)
    out.push({ type: 'flashcard', id: fc.id, front: fc.front, back: fc.back, lectureId: fc.lecture_id, lectureTitle: fc.lecture_title, courseId: fc.course_id, courseName: fc.course_name })
  return out
}

interface Props {
  onClose: () => void
  courseId?: number
  courseName?: string
}

export default function SearchModal({ onClose, courseId: initCourseId, courseName: initCourseName }: Props) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  // null = global, number = scoped to course
  const [scopeId, setScopeId] = useState<number | undefined>(initCourseId)
  const [scopeName, setScopeName] = useState<string | undefined>(initCourseName)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { setActiveIdx(-1) }, [debouncedQ, scopeId])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedQ, scopeId],
    queryFn: () => api.search(debouncedQ, scopeId),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  })

  const results: FlatResult[] = data ? flattenResults(data) : []
  const hasResults = results.length > 0
  const showEmpty = debouncedQ.length >= 2 && !isFetching && !hasResults

  function goTo(r: FlatResult) {
    onClose()
    if (r.type === 'topic')
      navigate({ to: '/courses/$courseId/topics/$tag', params: { courseId: String(r.courseId), tag: r.tag } })
    else if (r.type === 'lecture')
      navigate({ to: '/lectures/$lectureId', params: { lectureId: String(r.id) } })
    else
      navigate({ to: '/lectures/$lectureId', params: { lectureId: String(r.lectureId) } })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => {
        const next = Math.min(results.length - 1, i + 1)
        listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => {
        const next = Math.max(0, i - 1)
        listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
      goTo(results[activeIdx])
    }
  }

  // Group results by type for section headers
  const sections: { type: FlatResult['type']; label: string; items: FlatResult[] }[] = []
  for (const r of results) {
    const last = sections[sections.length - 1]
    if (!last || last.type !== r.type)
      sections.push({ type: r.type, label: r.type === 'topic' ? 'Topics' : r.type === 'lecture' ? 'Lectures' : 'Flashcards', items: [r] })
    else
      last.items.push(r)
  }

  let flatIdx = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-4 py-3">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>

          {/* Scope chip */}
          {scopeId && scopeName && (
            <div className="flex items-center gap-1 bg-indigo-100 text-indigo-700 rounded-lg px-2 py-0.5 shrink-0 text-sm font-medium">
              <span className="max-w-[140px] truncate">{scopeName}</span>
              <button
                onClick={() => { setScopeId(undefined); setScopeName(undefined); inputRef.current?.focus() }}
                className="text-indigo-400 hover:text-indigo-700 leading-none ml-0.5 text-base"
                title="Search everywhere"
              >×</button>
            </div>
          )}

          <input
            ref={inputRef}
            className="flex-1 min-w-0 text-sm outline-none placeholder-gray-400 text-gray-900 bg-transparent"
            placeholder={scopeId ? `Search in ${scopeName}…` : 'Search lectures, topics, flashcards…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {isFetching
            ? <div className="w-3.5 h-3.5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin shrink-0" />
            : <kbd className="shrink-0 text-[11px] text-gray-300 border border-gray-200 rounded px-1.5 py-0.5 font-sans leading-tight">esc</kbd>
          }
        </div>

        {/* Scope toggle — only available when opened from a course */}
        {initCourseId && (
          <div className="flex gap-1 px-4 pb-2">
            <button
              onClick={() => { setScopeId(initCourseId); setScopeName(initCourseName); inputRef.current?.focus() }}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${scopeId ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
            >
              This course
            </button>
            <button
              onClick={() => { setScopeId(undefined); setScopeName(undefined); inputRef.current?.focus() }}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${!scopeId ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Everywhere
            </button>
          </div>
        )}

        <div className="border-t border-gray-100" />

        {/* Results */}
        <div ref={listRef} className="max-h-[22rem] overflow-y-auto">
          {debouncedQ.length < 2 && (
            <p className="text-xs text-gray-400 text-center py-8">Type to search…</p>
          )}

          {showEmpty && (
            <p className="text-sm text-gray-400 text-center py-10">
              No results for "<span className="text-gray-500 font-medium">{debouncedQ}</span>"
              {scopeId && (
                <> — <button onClick={() => { setScopeId(undefined); setScopeName(undefined) }} className="text-indigo-500 hover:underline">search everywhere</button></>
              )}
            </p>
          )}

          {sections.map((section) => (
            <div key={section.type}>
              <p className="text-[11px] font-semibold text-gray-400 px-4 pt-3 pb-1">{section.label}</p>
              {section.items.map((r) => {
                const idx = flatIdx++
                const isActive = idx === activeIdx
                return (
                  <button
                    key={idx}
                    data-idx={idx}
                    onClick={() => goTo(r)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors group ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex-1 min-w-0">
                      {r.type === 'topic' && (
                        <>
                          <p className="text-sm font-semibold text-gray-900">{r.tag}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.lectureCount} lecture{r.lectureCount !== 1 ? 's' : ''}
                            {!scopeId && <> · {r.courseName}</>}
                          </p>
                        </>
                      )}
                      {r.type === 'lecture' && (
                        <>
                          <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                          {r.summary && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{r.summary}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {!scopeId && <span className="text-xs text-gray-400">{r.courseName}</span>}
                            {r.tags.slice(0, 3).map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500 font-medium border border-indigo-100">
                                {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {r.type === 'flashcard' && (
                        <>
                          <p className="text-sm font-semibold text-gray-900 truncate">{r.front}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">→ {r.back}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.lectureTitle}{!scopeId && <> · {r.courseName}</>}
                          </p>
                        </>
                      )}
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 shrink-0 mt-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}
                      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        {hasResults && (
          <>
            <div className="border-t border-gray-100" />
            <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-gray-300">
              <span><kbd className="font-sans border border-gray-200 rounded px-1">↑</kbd><kbd className="font-sans border border-gray-200 rounded px-1 ml-0.5">↓</kbd> navigate</span>
              <span><kbd className="font-sans border border-gray-200 rounded px-1">↵</kbd> open</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
