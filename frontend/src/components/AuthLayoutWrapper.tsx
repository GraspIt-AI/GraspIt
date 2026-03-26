import { useState, useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import SearchModal from './SearchModal'

interface SearchCtx {
  courseId?: number
  courseName?: string
}

export default function AuthLayoutWrapper() {
  const [searchCtx, setSearchCtx] = useState<SearchCtx | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchCtx((prev) => prev ?? {})
      }
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<SearchCtx>).detail ?? {}
      setSearchCtx(detail)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('graspit:search', onCustom)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('graspit:search', onCustom)
    }
  }, [])

  return (
    <>
      <Outlet />
      {searchCtx !== null && (
        <SearchModal
          onClose={() => setSearchCtx(null)}
          courseId={searchCtx.courseId}
          courseName={searchCtx.courseName}
        />
      )}
    </>
  )
}
