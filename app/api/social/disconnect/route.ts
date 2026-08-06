import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ZERNIO_API = 'https://zernio.com/api/v1'
const ZERNIO_KEY = process.env.ZERNIO_API_KEY!

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
}

const zHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ZERNIO_KEY}`,
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll() {
        // No-op: token refresh not needed for a single DELETE operation
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { connectionId } = await req.json()
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })
  }

  // Verify ownership: only return rows where both id and user_id match
  const connRes = await fetch(
    `${SUPABASE_URL}/rest/v1/social_connections?id=eq.${connectionId}&user_id=eq.${user.id}&select=id,aggregator_account_id`,
    { headers: sbHeaders }
  )
  const rows = await connRes.json()
  const connection = rows?.[0]

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Call Zernio DELETE — treat 404 as "already removed", proceed anyway
  if (connection.aggregator_account_id) {
    const zernioRes = await fetch(
      `${ZERNIO_API}/accounts/${connection.aggregator_account_id}`,
      { method: 'DELETE', headers: zHeaders }
    )
    if (!zernioRes.ok && zernioRes.status !== 404) {
      console.error(
        `[social/disconnect] Zernio DELETE failed: status=${zernioRes.status} accountId=${connection.aggregator_account_id}`
      )
      return NextResponse.json({ error: 'Failed to disconnect from provider' }, { status: 502 })
    }
  }

  await fetch(
    `${SUPABASE_URL}/rest/v1/social_connections?id=eq.${connectionId}`,
    { method: 'DELETE', headers: sbHeaders }
  )

  return NextResponse.json({ success: true })
}
