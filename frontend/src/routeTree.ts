import { createRootRoute, createRoute, Outlet, redirect } from '@tanstack/react-router'
import RecordPage from './routes/index'
import ResultsPage from './routes/results'
import CoursesPage from './routes/courses'
import CourseDetailPage from './routes/course'
import LecturePage from './routes/lecture'
import LoginPage from './routes/login'
import RegisterPage from './routes/register'
import { isAuthenticated } from './authStore'

const rootRoute = createRootRoute()

// ── Public routes ─────────────────────────────────────────────────────────────

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: '/courses' })
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: '/courses' })
  },
})

// ── Auth guard layout ─────────────────────────────────────────────────────────

const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_auth',
  component: Outlet,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' })
  },
})

// ── Protected routes (children of authLayout) ─────────────────────────────────

const recordRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/',
  component: RecordPage,
})

const resultsRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/results',
  component: ResultsPage,
})

const coursesRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/courses',
  component: CoursesPage,
})

const courseDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/courses/$courseId',
  component: () => {
    const { courseId } = courseDetailRoute.useParams()
    return CourseDetailPage({ courseId: parseInt(courseId) })
  },
})

const lectureRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/lectures/$lectureId',
  component: () => {
    const { lectureId } = lectureRoute.useParams()
    return LecturePage({ lectureId: parseInt(lectureId) })
  },
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  authLayout.addChildren([
    recordRoute,
    resultsRoute,
    coursesRoute,
    courseDetailRoute,
    lectureRoute,
  ]),
])
