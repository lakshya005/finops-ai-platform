'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900">
        <span className="text-sm font-medium text-slate-400">FinOps Platform</span>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-slate-800"
        >
          Log out
        </button>
      </header>
      {children}
    </div>
  )
}
