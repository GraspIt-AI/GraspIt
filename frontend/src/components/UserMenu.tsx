import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getAuthUser, getRefreshToken, clearAuth } from '../authStore'
import { auth } from '../api'

export default function UserMenu() {
  const navigate = useNavigate()
  const user = getAuthUser()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      const refresh = getRefreshToken()
      if (refresh) await auth.logout(refresh)
    } catch {
      // proceed anyway
    }
    clearAuth()
    navigate({ to: '/login' })
  }

  if (!user) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="font-medium hidden sm:inline">{user.username}</span>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-20 w-48 bg-white rounded-2xl shadow-lg border border-gray-100 py-1 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-800">{user.username}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 transition-colors"
            >
              {loading ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
