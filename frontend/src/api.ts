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
  created_at: string
  flashcard_count: number
}

export interface CourseDetail extends Omit<CourseListItem, 'lecture_count'> {
  lectures: LectureListItem[]
}

export interface LectureDetail {
  id: number
  course: number
  title: string
  summary: string
  transcript: string
  notes: string
  created_at: string
  flashcards: { id: number; front: string; back: string; order: number }[]
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
  courses: {
    list: () => req<CourseListItem[]>('/api/courses/'),
    create: (body: { name: string; description?: string; color?: string }) =>
      req<CourseListItem>('/api/courses/', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => req<CourseDetail>(`/api/courses/${id}/`),
    update: (id: number, body: Partial<{ name: string; description: string; color: string }>) =>
      req<CourseListItem>(`/api/courses/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) => req<void>(`/api/courses/${id}/`, { method: 'DELETE' }),
  },
  lectures: {
    save: (body: {
      course: number
      title: string
      summary: string
      transcript: string
      notes: string
      flashcards: { front: string; back: string }[]
    }) => req<LectureDetail>('/api/lectures/', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: number) => req<LectureDetail>(`/api/lectures/${id}/`),
    update: (id: number, body: { transcript: string }) =>
      req<LectureDetail>(`/api/lectures/${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
    regenerate: (id: number) =>
      req<LectureDetail>(`/api/lectures/${id}/regenerate/`, { method: 'POST' }),
    delete: (id: number) => req<void>(`/api/lectures/${id}/`, { method: 'DELETE' }),
  },
}
