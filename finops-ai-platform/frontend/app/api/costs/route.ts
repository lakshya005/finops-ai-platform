import { NextRequest, NextResponse } from 'next/server'
import clickhouse from '@/lib/clickhouse'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const orgId = searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const days = parseInt(searchParams.get('days') ?? '7', 10)
  const since = Date.now() - days * 24 * 60 * 60 * 1000

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
      query_params: { orgId, since },
      format: 'JSONEachRow',
    })

    const rows = await result.json()
    return NextResponse.json(rows)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ClickHouse unreachable'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
