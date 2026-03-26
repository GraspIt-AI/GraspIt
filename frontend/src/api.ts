export interface CourseListItem {
  id: number
  name: string
  description: string
  color: string
  created_at: string
  updated_at: string
  lecture_count: number
}

export interface LectureListItem {
  id: number
  title: string
  summary: string
  tags: string[]
  created_at: string
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
  flashcards: { id: number; front: string; back: string; order: number }[]
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

export async function downloadFile(url: string, filename: string): Promise<void> {
  const { getAccessToken } = await import('./authStore')
  const token = getAccessToken()
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  courses: {
    list: () => req<CourseListItem[]>('/api/courses/'),
    create: (body: { name: string; description?: string; color?: string }) =>
      req<CourseListItem>('/api/courses/', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => req<CourseDetail>(`/api/courses/${id}/`),
    update: (id: number, body: Partial<{ name: string; description: string; color: string }>) =>
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
    update: (id: number, body: Partial<{ transcript: string; tags: string[] }>) =>
      req<LectureDetail>(`/api/lectures/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
    regenerate: (id: number) =>
      req<LectureDetail>(`/api/lectures/${id}/regenerate/`, { method: 'POST' }),
    delete: (id: number) => req<void>(`/api/lectures/${id}/`, { method: 'DELETE' }),
  },
}
