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

async function loadProfile(userId: string): Promise<{ idea?: string; sector?: string; goal?: string }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/founder_profiles?user_id=eq.${userId}&select=idea,sector,goal`,
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

  const { platforms, brief } = await req.json()
  if (!platforms?.length || !brief) {
    return NextResponse.json({ error: 'Missing platforms or brief' }, { status: 400 })
  }

  const profile = await loadProfile(user.id)

  const platformList = (platforms as string[]).join(', ')
  const isShortForm = (platforms as string[]).some(p => ['instagram', 'tiktok'].includes(p.toLowerCase()))
  const lengthGuide = isShortForm
    ? 'Scrivi un testo breve e diretto (max 150 parole).'
    : 'Puoi scrivere un testo più articolato (fino a 300 parole).'

  const systemPrompt = `Sei un copywriter esperto di social media. Scrivi un post per ${platformList} per un'attività che fa: ${profile.idea ?? 'non specificato'}, settore ${profile.sector ?? 'non specificato'}, obiettivo ${profile.goal ?? 'non specificato'}. ${lengthGuide} Tono adatto alla piattaforma, senza hashtag eccessivi, senza emoji eccessive. Scrivi in italiano a meno che il messaggio del founder non sia in un'altra lingua. Rispondi solo con il testo del post, senza preamboli o spiegazioni.`

  let response
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: brief }],
    })
  } catch (err) {
    console.error('[social/generate-copy] Claude API error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Generazione non riuscita, riprova' }, { status: 502 })
  }

  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ content })
}
