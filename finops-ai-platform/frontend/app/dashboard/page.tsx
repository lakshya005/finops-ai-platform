import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import clickhouse from '@/lib/clickhouse'
import SpendChart from './SpendChart'

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
    const result = await clickhouse.query({
      query: `
        SELECT
          model,
          provider,
          toDate(toDateTime(timestamp_ms / 1000)) as date,
          round(sum(cost_usd), 6) as total_cost,
          count() as requests
        FROM cost_events
        WHERE org_id = {orgId: String}
          AND timestamp_ms >= {since: Int64}
        GROUP BY model, provider, date
        ORDER BY date DESC, total_cost DESC
      `,
      query_params: { orgId: ORG_ID, since },
      format: 'JSONEachRow',
    })
    return result.json()
  } catch {
    return []
  }
}

async function getSummary(): Promise<Summary> {
  try {
    const [totalsResult, byProviderResult] = await Promise.all([
      clickhouse.query({
        query: `
          SELECT
            round(sum(cost_usd), 6) as total_cost_usd,
            count() as total_requests
          FROM cost_events
          WHERE org_id = {orgId: String}
        `,
        query_params: { orgId: ORG_ID },
        format: 'JSONEachRow',
      }),
      clickhouse.query({
        query: `
          SELECT
            provider,
            round(sum(cost_usd), 6) as cost
          FROM cost_events
          WHERE org_id = {orgId: String}
          GROUP BY provider
          ORDER BY cost DESC
        `,
        query_params: { orgId: ORG_ID },
        format: 'JSONEachRow',
      }),
    ])

    const [totals] = await totalsResult.json<{ total_cost_usd: number; total_requests: number }>()
    const byProvider = await byProviderResult.json<{ provider: string; cost: number }>()

    return {
      total_cost_usd: totals.total_cost_usd,
      total_requests: totals.total_requests,
      by_provider: byProvider,
    }
  } catch {
    return { total_cost_usd: 0, total_requests: 0, by_provider: [] }
  }
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
    <main className="p-6 space-y-8">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">FinOps Dashboard</h1>
        <span className="text-sm text-slate-400">{user.email}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total spend" value={fmt(summary.total_cost_usd)} />
        <KpiCard label="Total requests" value={summary.total_requests.toLocaleString()} />
        <KpiCard label="Top provider" value={topProvider} />
      </div>

      {/* Spend over time */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Spend over time (last 7 days)
        </h2>
        <SpendChart data={chartData} />
      </section>

      {/* Cost breakdown table */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Cost breakdown
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-left">
                <th className="px-5 py-3 font-medium">Model</th>
                <th className="px-5 py-3 font-medium">Provider</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium text-right">Requests</th>
                <th className="px-5 py-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sortedCosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No data for this period.
                  </td>
                </tr>
              ) : (
                sortedCosts.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-slate-300">{row.model}</td>
                    <td className="px-5 py-3 text-slate-300">{row.provider}</td>
                    <td className="px-5 py-3 text-slate-400">{row.date}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-300">
                      {row.requests.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-indigo-400 font-medium">
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
