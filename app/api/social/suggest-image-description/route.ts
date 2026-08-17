import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function loadProfile(userId: string): Promise<{ idea?: string; sector?: string; business_description?: string }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/founder_profiles?user_id=eq.${userId}&select=idea,sector,business_description`,
      { headers: sbHeaders }
    )
    if (!res.ok) return {}
    const rows = await res.json()
    return rows?.[0] ?? {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let brief: string
  let postText: string | undefined
  try {
    const body = await req.json()
    brief = body.brief
    postText = body.postText
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!brief?.trim()) {
    return NextResponse.json({ error: 'Missing brief' }, { status: 400 })
  }

  const profile = await loadProfile(user.id)

  const postLine = postText?.trim() ? `Testo del post: ${postText.trim()}` : ''
  const descLine = profile.business_description?.trim() ? ` (${profile.business_description.trim()})` : ''

  const userMessage = [
    `Attività: ${profile.idea ?? 'non specificata'}, settore ${profile.sector ?? 'non specificato'}${descLine}.`,
    `Il post riguarda: ${brief.trim()}.`,
    postLine,
    'Scrivi una breve descrizione (1-2 frasi) di cosa dovrebbe mostrare l\'immagine per questo post — concentrati su soggetto, ambientazione, mood, colori. NON includere testo/scritte da inserire nell\'immagine, solo elementi visivi. Rispondi solo con la descrizione, senza preamboli.',
  ].filter(Boolean).join('\n')

  let description: string
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: 'Sei un art director specializzato in contenuti social.',
      messages: [{ role: 'user', content: userMessage }],
    })
    description = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err) {
    console.error('[social/suggest-image-description] Claude API error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Suggerimento non riuscito, riprova' }, { status: 502 })
  }

  return NextResponse.json({ description })
}
