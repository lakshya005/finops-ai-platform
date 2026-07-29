import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const orgId = searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const days = parseInt(searchParams.get('days') ?? '7', 10)
  const since = Date.now() - days * 24 * 60 * 60 * 1000

  try {
    const supabase = createClient()
    const { data: rows, error } = await supabase.rpc('get_costs_by_date', {
      p_org_id: orgId,
      p_since_ms: since
    })

    if (error) {
      throw error
    }

    // Ensure numeric types match expected API response (if needed)
    return NextResponse.json(rows)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supabase unreachable'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
