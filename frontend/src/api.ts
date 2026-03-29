export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface CourseFolder {
  id: number
  name: string
  created_at: string
  course_count: number
}

export interface LectureFolder {
  id: number
  name: string
  created_at: string
  lecture_count: number
}

export interface CourseListItem {
  id: number
  name: string
  description: string
  color: string
  created_at: string
  updated_at: string
  lecture_count: number
  folder_id: number | null
}

export interface LectureListItem {
  id: number
  title: string
  summary: string
  tags: string[]
  created_at: string
  flashcard_count: number
  folder_id: number | null
}

export interface RecentLecture {
  id: number
  title: string
  created_at: string
  course_id: number
  course_name: string
  course_color: string
  flashcard_count: number
}

export interface ExamScore {
  tag: string
  last_score: number | null
  last_total: number | null
  attempts: number
}

export interface CourseDetail extends Omit<CourseListItem, 'lecture_count'> {
  lectures: LectureListItem[]
  exam_scores: ExamScore[]
  lecture_folders: LectureFolder[]
}

export interface LectureDetail {
  id: number
  course: number
  title: string
  summary: string
  tags: string[]
  transcript: string
  notes: string
  created_at: string
  flashcards: { id: number; front: string; back: string; order: number; is_manual: boolean }[]
}

export type ExamQuestion =
  | { type: 'mcq'; question: string; options: string[]; correct: number; explanation: string }
  | { type: 'numeric'; question: string; answer: string; explanation: string }
  | { type: 'short_answer'; question: string; answer: string }

export interface SearchResults {
  topics: { tag: string; course_id: number; course_name: string; lecture_count: number }[]
  lectures: { id: number; title: string; summary: string; course_id: number; course_name: string; tags: string[] }[]
  flashcards: { id: number; front: string; back: string; lecture_id: number; lecture_title: string; course_id: number; course_name: string }[]
}

export interface TopicData {
  tag: string
  course_name: string
  lectures: {
    id: number
    title: string
    notes: string
    flashcards: { front: string; back: string }[]
  }[]
}

export async function streamCourseChat(
  courseId: number,
  messages: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const { getAccessToken } = await import('./authStore')
  const token = getAccessToken()
  const res = await fetch(`${API_BASE}/api/courses/${courseId}/chat/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok || !res.body) { onError('Request failed'); return }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') { onDone(); return }
      try {
        const parsed = JSON.parse(payload)
        if (parsed.error) { onError(parsed.error); return }
        if (parsed.text) onChunk(parsed.text)
      } catch {}
    }
  }
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  const { getAccessToken } = await import('./authStore')
  const token = getAccessToken()
  const res = await fetch(`${API_BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Download failed')
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const { getAccessToken } = await import('./authStore')
  const token = getAccessToken()
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? data.error ?? 'Request failed')
  return data
}

export interface AuthResponse {
  tokens: { access: string; refresh: string }
  user: { id: number; email: string; username: string }
}

export const auth = {
  register: (body: { email: string; username: string; password: string }) =>
    req<AuthResponse>('/api/auth/register/', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    req<AuthResponse>('/api/auth/login/', { method: 'POST', body: JSON.stringify(body) }),
  logout: (refresh: string) =>
    req<void>('/api/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) }),
  me: () => req<{ id: number; email: string; username: string }>('/api/auth/me/'),
}

export const api = {
  search: (q: string, courseId?: number) =>
    req<SearchResults>(`/api/search/?q=${encodeURIComponent(q)}${courseId ? `&course_id=${courseId}` : ''}`),
  courseFolders: {
    list: () => req<CourseFolder[]>('/api/course-folders/'),
    create: (body: { name: string }) =>
      req<CourseFolder>('/api/course-folders/', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) => req<void>(`/api/course-folders/${id}/`, { method: 'DELETE' }),
  },
  lectureFolders: {
    create: (courseId: number, body: { name: string }) =>
      req<LectureFolder>(`/api/courses/${courseId}/lecture-folders/`, { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) => req<void>(`/api/lecture-folders/${id}/`, { method: 'DELETE' }),
  },
  courses: {
    list: () => req<{ courses: CourseListItem[]; folders: CourseFolder[] }>('/api/courses/'),
    default: () => req<{ id: number; name: string }>('/api/courses/default/'),
    create: (body: { name: string; description?: string; color?: string }) =>
      req<CourseListItem>('/api/courses/', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => req<CourseDetail>(`/api/courses/${id}/`),
    update: (id: number, body: Partial<{ name: string; description: string; color: string; folder_id: number | null }>) =>
      req<CourseListItem>(`/api/courses/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) => req<void>(`/api/courses/${id}/`, { method: 'DELETE' }),
    getExam: (id: number, tag: string) =>
      req<{ found: boolean; questions?: ExamQuestion[]; stale?: boolean; generated_at?: string }>(
        `/api/courses/${id}/exam/?tag=${encodeURIComponent(tag)}`
      ),
    submitScore: (id: number, tag: string, score: number, total: number) =>
      req<void>(`/api/courses/${id}/exam/`, { method: 'PATCH', body: JSON.stringify({ tag, score, total }) }),
    exam: (id: number, tag: string) =>
      req<{ found: boolean; questions: ExamQuestion[]; stale: boolean }>(
        `/api/courses/${id}/exam/`, { method: 'POST', body: JSON.stringify({ tag }) }
      ),
    topic: (id: number, tag: string) =>
      req<TopicData>(`/api/courses/${id}/topic/?tag=${encodeURIComponent(tag)}`),
  },
  lectures: {
    recent: () => req<RecentLecture[]>('/api/lectures/recent/'),
    save: (body: {
      course: number
      title: string
      summary: string
      tags: string[]
      transcript: string
      notes: string
      flashcards: { front: string; back: string }[]
    }) => req<LectureDetail>('/api/lectures/', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => req<LectureDetail>(`/api/lectures/${id}/`),
    update: (id: number, body: Partial<{ transcript: string; tags: string[]; notes: string; folder_id: number | null }>) =>
      req<LectureDetail>(`/api/lectures/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
    regenerate: (id: number) =>
      req<LectureDetail>(`/api/lectures/${id}/regenerate/`, { method: 'POST' }),
    delete: (id: number) => req<void>(`/api/lectures/${id}/`, { method: 'DELETE' }),
    clear: (id: number) => req<LectureDetail>(`/api/lectures/${id}/clear/`, { method: 'POST' }),
    append: async (id: number, form: FormData): Promise<LectureDetail> => {
      const { getAccessToken } = await import('./authStore')
      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/api/lectures/${id}/append/`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Append failed')
      return data
    },
  },
  flashcards: {
    create: (lectureId: number, data: { front: string; back: string }) =>
      req<{ id: number; front: string; back: string; order: number; is_manual: boolean }>(
        `/api/lectures/${lectureId}/flashcards/`, { method: 'POST', body: JSON.stringify(data) }
      ),
    delete: (id: number) => req<void>(`/api/flashcards/${id}/`, { method: 'DELETE' }),
    update: (id: number, data: { front?: string; back?: string }) =>
      req<{ id: number; front: string; back: string; order: number; is_manual: boolean }>(
        `/api/flashcards/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }
      ),
  },
}
