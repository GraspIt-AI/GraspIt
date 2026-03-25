import { createRootRoute, createRoute } from '@tanstack/react-router'
import RecordPage from './routes/index'
import ResultsPage from './routes/results'

const rootRoute = createRootRoute()

const recordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: RecordPage,
})

const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/results',
  component: ResultsPage,
})

export const routeTree = rootRoute.addChildren([recordRoute, resultsRoute])
