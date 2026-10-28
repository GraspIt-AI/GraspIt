import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { routeTree } from './routeTree'
import { setResults, type LectureResults } from './store'

const queryClient = new QueryClient()
const router = createRouter({ routeTree })

// Dev-only test helper
if (import.meta.env.DEV) {
  ;(window as Window & { __test?: (data: unknown) => void }).__test = (data) => {
    setResults(data as LectureResults)
    router.navigate({ to: '/results' })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
