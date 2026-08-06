import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { connectionIds, content, scheduledFor, timezone } = await req.json()
  if (!connectionIds?.length || !content) {
    return NextResponse.json({ error: 'Missing connectionIds or content' }, { status: 400 })
  }

  // Ownership check: only fetch rows belonging to this user
  const idList = (connectionIds as string[]).join(',')
  const connRes = await fetch(
    `${SUPABASE_URL}/rest/v1/social_connections?id=in.(${idList})&user_id=eq.${user.id}&select=id,platform,aggregator_account_id`,
    { headers: sbHeaders }
  )
  const rows: Array<{ platform: string; aggregator_account_id: string }> = await connRes.json()

  if (!rows?.length) {
    return NextResponse.json({ error: 'No valid connections found' }, { status: 400 })
  }

  const validRows = rows.filter(r => r.aggregator_account_id)
  if (!validRows.length) {
    return NextResponse.json({ error: 'Nessun account valido tra quelli selezionati' }, { status: 400 })
  }

  const platforms = validRows.map(r => ({
    platform: r.platform,
    accountId: r.aggregator_account_id,
  }))

  const body: Record<string, unknown> = { content, platforms }
  if (scheduledFor) {
    body.scheduledFor = scheduledFor
    body.timezone = timezone ?? 'Europe/Rome'
  } else {
    body.publishNow = true
  }

  const zernioRes = await fetch(`${ZERNIO_API}/posts`, {
    method: 'POST',
    headers: zHeaders,
    body: JSON.stringify(body),
  })

  if (!zernioRes.ok) {
    const zBody = await zernioRes.text()
    console.error(`[social/publish] Zernio POST /posts failed: status=${zernioRes.status} body=${zBody}`)
    return NextResponse.json({ error: 'Pubblicazione non riuscita sul provider' }, { status: 502 })
  }

  const zData = await zernioRes.json()
  return NextResponse.json({ success: true, postId: zData.id ?? zData.postId ?? null })
}
