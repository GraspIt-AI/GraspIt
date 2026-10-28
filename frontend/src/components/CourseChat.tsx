import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Md from './Md'
import { streamCourseChat, api } from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  courseId?: number | null
  courseName?: string | null
  onClose: () => void
}

const STORAGE_KEY = (id: number) => `graspit_chat_${id}`

function loadMessages(id: number): Message[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY(id))
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export default function CourseChat({ courseId: initialCourseId, courseName: initialCourseName, onClose }: Props) {
  const [activeCourseId, setActiveCourseId] = useState<number | null>(initialCourseId ?? null)
  const [activeCourseName, setActiveCourseName] = useState<string | null>(initialCourseName ?? null)

  const picking = activeCourseId === null

  const [messages, setMessages] = useState<Message[]>(() => (initialCourseId ? loadMessages(initialCourseId) : []))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!streaming && activeCourseId) {
      try {
        localStorage.setItem(STORAGE_KEY(activeCourseId), JSON.stringify(messages))
      } catch { /* storage full or blocked: chat still works, just isn't kept */ }
    }
  }, [messages, streaming, activeCourseId])

  useEffect(() => {
    if (!picking) inputRef.current?.focus()
  }, [picking])

  function clearHistory() {
    if (!activeCourseId) return
    localStorage.removeItem(STORAGE_KEY(activeCourseId))
    setMessages([])
  }

  function selectCourse(id: number, name: string) {
    setActiveCourseId(id)
    setActiveCourseName(name)
    setMessages(loadMessages(id))
  }

  async function send(text: string) {
    if (!activeCourseId) return
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content: trimmed }
    const assistantPlaceholder: Message = { role: 'assistant', content: '' }
    const nextMessages = [...messages, userMsg, assistantPlaceholder]
    setMessages(nextMessages)
    setStreaming(true)

    await streamCourseChat(
      activeCourseId,
      [...messages, userMsg],
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      },
      () => setStreaming(false),
      (err) => {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err}` }
          return updated
        })
        setStreaming(false)
      },
    )
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const suggestions = [
    `What topics were covered in ${activeCourseName ?? 'this course'}?`,
    'Summarise the key takeaways from all lectures',
    'What should I focus on to review?',
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[380px] z-50 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">
                {picking ? 'Chat' : 'Ask your lectures'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 ml-6">
              {picking ? 'Pick a course to get started' : activeCourseName}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!picking && messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors px-1.5 py-0.5 rounded"
                title="Clear chat history"
              >
                Clear
              </button>
            )}
            {!picking && initialCourseId == null && (
              <button
                onClick={() => { setActiveCourseId(null); setActiveCourseName(null); setMessages([]) }}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors px-1.5 py-0.5 rounded"
                title="Switch course"
              >
                Switch
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-gray-500 transition-colors text-2xl leading-none mt-0.5"
            >
              ×
            </button>
          </div>
        </div>

        {picking ? (
          <CoursePicker onSelect={selectCourse} />
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Ask anything about {activeCourseName}</p>
                    <p className="text-xs text-gray-400 mt-1">Answers are based on your lecture content</p>
                  </div>
                  <div className="flex flex-col gap-2 w-full mt-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-xs px-3 py-2.5 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {msg.content ? (
                        msg.role === 'user' ? (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1 prose-strong:font-semibold prose-p:leading-relaxed">
                            <Md>{msg.content}</Md>
                          </div>
                        )
                      ) : (streaming && i === messages.length - 1 ? (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      ) : '')}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-gray-100 px-4 py-3 flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 placeholder-gray-400 max-h-32 overflow-y-auto"
                placeholder={`Ask about ${activeCourseName}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={streaming}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || streaming}
                className="shrink-0 w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function CoursePicker({ onSelect }: { onSelect: (id: number, name: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['courses'], queryFn: api.courses.list })
  const courses = data?.courses ?? []

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No courses yet. Save a lecture first.
        </div>
      ) : (
        courses.map((c: { id: number; name: string; color: string; lecture_count: number }) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id, c.name)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 text-left transition-colors"
          >
            <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
              style={{ background: c.color }}>
              {c.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
              <p className="text-xs text-gray-400">{c.lecture_count} lecture{c.lecture_count !== 1 ? 's' : ''}</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))
      )}
    </div>
  )
}
