import { NextRequest, NextResponse } from 'next/server'
import clickhouse from '@/lib/clickhouse'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const orgId = searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

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
        query_params: { orgId },
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
        query_params: { orgId },
        format: 'JSONEachRow',
      }),
    ])

    const [totals] = await totalsResult.json<{
      total_cost_usd: number
      total_requests: number
    }>()

    const byProvider = await byProviderResult.json<{
      provider: string
      cost: number
    }>()

    return NextResponse.json({
      total_cost_usd: totals.total_cost_usd,
      total_requests: totals.total_requests,
      by_provider: byProvider,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ClickHouse unreachable'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
