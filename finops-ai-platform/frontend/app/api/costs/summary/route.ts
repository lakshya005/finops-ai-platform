import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const orgId = searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  try {
    const supabase = createClient()
    const [totalsResult, byProviderResult] = await Promise.all([
      supabase.rpc('get_costs_totals', { p_org_id: orgId }),
      supabase.rpc('get_costs_by_provider', { p_org_id: orgId })
    ])

    if (totalsResult.error) throw totalsResult.error
    if (byProviderResult.error) throw byProviderResult.error

    // In Postgres, totals return as a single-row array or object depending on the RPC return type
    // If we return TABLE, it's an array. Let's assume it returns an array with one object.
    const totals = (totalsResult.data as Array<{ total_cost_usd: number; total_requests: number }>)?.[0] || { total_cost_usd: 0, total_requests: 0 }
    const byProvider = byProviderResult.data || []

    return NextResponse.json({
      total_cost_usd: totals.total_cost_usd,
      total_requests: totals.total_requests,
      by_provider: byProvider,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supabase unreachable'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
