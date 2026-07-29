import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SpendChart from './SpendChart'
import type { ReactNode } from 'react'

const ORG_ID = 'org_test_01'
const DAYS = 7

interface CostRow {
  model: string
  provider: string
  date: string
  total_cost: number
  requests: number
}

interface Summary {
  total_cost_usd: number
  total_requests: number
  by_provider: Array<{ provider: string; cost: number }>
}

function fmt(cost: number) {
  return `$${cost.toFixed(6)}`
}

async function getCosts(): Promise<CostRow[]> {
  const since = Date.now() - DAYS * 24 * 60 * 60 * 1000
  try {
    const supabase = createClient()
    const { data: rows, error } = await supabase.rpc('get_costs_by_date', {
      p_org_id: ORG_ID,
      p_since_ms: since,
    })

    if (error) throw error

    return rows || []
  } catch {
    return []
  }
}

async function getSummary(): Promise<Summary> {
  try {
    const supabase = createClient()
    const [totalsResult, byProviderResult] = await Promise.all([
      supabase.rpc('get_costs_totals', { p_org_id: ORG_ID }),
      supabase.rpc('get_costs_by_provider', { p_org_id: ORG_ID })
    ])

    if (totalsResult.error) throw totalsResult.error
    if (byProviderResult.error) throw byProviderResult.error

    const totals = (totalsResult.data as any[])[0] || { total_cost_usd: 0, total_requests: 0 }
    const byProvider = byProviderResult.data || []

    return {
      total_cost_usd: totals.total_cost_usd,
      total_requests: totals.total_requests,
      by_provider: byProvider,
    }
  } catch {
    return { total_cost_usd: 0, total_requests: 0, by_provider: [] }
  }
}

const PROVIDER_BADGE: Record<string, string> = {
  openai:    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  anthropic: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [costs, summary] = await Promise.all([getCosts(), getSummary()])

  const chartData = Object.entries(
    costs.reduce<Record<string, number>>((acc, row) => {
      acc[row.date] = (acc[row.date] ?? 0) + row.total_cost
      return acc
    }, {})
  )
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const topProvider = summary.by_provider[0]?.provider ?? '—'
  const sortedCosts = [...costs].sort((a, b) => b.total_cost - a.total_cost)

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI model spend · last {DAYS} days</p>
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-800/80 border border-slate-700/50 rounded-full px-3 py-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          {user.email}
        </span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total spend"
          value={fmt(summary.total_cost_usd)}
          iconClass="bg-indigo-500/10 text-indigo-400"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5V14.5M11 4H6.5C5.12 4 4 5.12 4 6.5S5.12 9 6.5 9H9.5C10.88 9 12 10.12 12 11.5S10.88 14 9.5 14H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
        <KpiCard
          label="Total requests"
          value={summary.total_requests.toLocaleString()}
          iconClass="bg-violet-500/10 text-violet-400"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8H4L6 3L8 13L10 6L12 9H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <KpiCard
          label="Top provider"
          value={topProvider}
          iconClass="bg-sky-500/10 text-sky-400"
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="3.5" width="13" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="1.5" y="9.5" width="13" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="5.5" r="0.75" fill="currentColor"/>
              <circle cx="12" cy="11.5" r="0.75" fill="currentColor"/>
            </svg>
          }
        />
      </div>

      {/* Spend over time */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Spend over time</h2>
            <p className="text-xs text-slate-500 mt-0.5">Daily cost across all models · last {DAYS} days</p>
          </div>
          <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2.5 py-1">
            {DAYS}d
          </span>
        </div>
        <SpendChart data={chartData} />
      </section>

      {/* Cost breakdown table */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Cost breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">Per-model usage and cost</p>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {sortedCosts.length} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/80">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Model</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Requests</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sortedCosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-slate-700">
                        <rect x="4" y="8" width="24" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M10 14H22M10 19H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M16 4L16 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <p className="text-sm font-medium text-slate-600">No data for this period</p>
                      <p className="text-xs text-slate-700">Cost events will appear here once ingested</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedCosts.map((row, i) => (
                  <tr
                    key={i}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-300">{row.model}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${PROVIDER_BADGE[row.provider.toLowerCase()] ?? 'bg-slate-700/50 text-slate-300 border border-slate-600/30'}`}>
                        {row.provider}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 text-xs tabular-nums">{row.date}</td>
                    <td className="px-6 py-3.5 text-right tabular-nums text-slate-300">
                      {row.requests.toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-indigo-400">
                      {fmt(row.total_cost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function KpiCard({ label, value, icon, iconClass }: { label: string; value: string; icon: ReactNode; iconClass: string }) {
  return (
    <div className="relative bg-slate-900/60 border border-slate-800/80 rounded-2xl px-6 py-5 hover:border-slate-700 transition-colors group overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${iconClass}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-3xl font-bold tabular-nums text-white tracking-tight">{value}</p>
    </div>
  )
}
