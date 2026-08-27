import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY!

// I TOS Unsplash richiedono di triggerare GET download_location ogni volta che una foto
// viene effettivamente "scaricata" (= aggiunta al canvas nel nostro caso). Il valore
// restituito da Unsplash non ci serve — è solo per l'analytics del fotografo.
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { downloadLocation } = await req.json()
  if (typeof downloadLocation !== 'string' || !downloadLocation.startsWith('https://api.unsplash.com/')) {
    return NextResponse.json({ error: 'Invalid downloadLocation' }, { status: 400 })
  }

  try {
    const res = await fetch(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
    })
    if (!res.ok) {
      console.error(`[social/unsplash/track-download] Unsplash track failed: status=${res.status}`)
      // Non blocchiamo l'utente: il tracking è best-effort, il canvas ha già la foto.
    }
  } catch (err) {
    console.error('[social/unsplash/track-download] fetch error:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true })
}
