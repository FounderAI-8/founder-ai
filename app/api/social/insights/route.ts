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

const CACHE_TTL_MS: Record<string, number> = {
  dates: 30 * 24 * 60 * 60 * 1000,
  trends: 7 * 24 * 60 * 60 * 1000,
}

function buildCacheKey(sector: string, city?: string): string {
  return city ? `${sector}|${city}` : sector
}

async function getFromCache(cacheKey: string, kind: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sector_content_cache?sector=eq.${encodeURIComponent(cacheKey)}&kind=eq.${encodeURIComponent(kind)}&select=items,updated_at`,
      { headers: sbHeaders }
    )
    if (!res.ok) return null
    const rows = await res.json()
    if (!rows?.length) return null
    const { items, updated_at } = rows[0]
    const age = Date.now() - new Date(updated_at).getTime()
    if (age > CACHE_TTL_MS[kind]) return null
    return items
  } catch {
    return null
  }
}

async function saveToCache(cacheKey: string, kind: string, items: unknown[]) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sector_content_cache`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ sector: cacheKey, kind, items, updated_at: new Date().toISOString() }),
    })
  } catch (err) {
    console.error(`[social/insights] saveToCache failed cacheKey=${cacheKey} kind=${kind}:`, err instanceof Error ? err.message : err)
  }
}

const USER_PROMPTS: Record<string, (sector: string, city?: string, businessDescription?: string) => string> = {
  dates: (sector, city, businessDescription) => {
    const businessCtx = businessDescription ? ` (${businessDescription})` : ''
    const cityCtx = city ? `, in particolare nella zona di ${city} se rilevante` : ''
    return `Identifica le 8-10 date/eventi più rilevanti nei prossimi 3 mesi per un'attività nel settore ${sector}${businessCtx} in Italia${cityCtx} — sia ricorrenze fisse (festività, giornate mondiali, eventi commerciali come Black Friday) sia eventi variabili che richiedono una ricerca aggiornata (eventi sportivi, culturali, di attualità) SE rilevanti per questo tipo di business specifico. Per ciascuna data fornisci: la data esatta, cosa succede, perché conta per questo settore, un suggerimento pratico concreto. I campi why_relevant e suggestion devono essere massimo una frase breve ciascuno (15-20 parole). Rispondi in formato JSON: un array di oggetti con i campi date, title, why_relevant, suggestion.`
  },
  trends: (sector, _city, businessDescription) => {
    const businessCtx = businessDescription ? ` (${businessDescription})` : ''
    return `Identifica 6-8 trend di contenuto attuali su Instagram, TikTok e YouTube, riadattati per un'attività nel settore ${sector}${businessCtx}. Per ciascuno: piattaforma, in cosa consiste il trend, come un'attività di questo settore potrebbe usarlo concretamente. I campi description e how_to_use devono essere massimo una frase breve ciascuno (15-20 parole). Rispondi in formato JSON: un array di oggetti con i campi platform, trend_title, description, how_to_use.`
  },
}

const SYSTEM_PROMPT =
  'Sei un esperto di marketing e social media in Italia. Usa il web_search tool per cercare informazioni aggiornate. Rispondi sempre e solo con JSON valido (array), senza markdown, senza backtick, senza preamboli o spiegazioni.'

async function generateContent(sector: string, kind: string, city?: string, businessDescription?: string): Promise<unknown[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webSearchTool: any = { type: 'web_search_20250305', name: 'web_search' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: USER_PROMPTS[kind](sector, city, businessDescription) }]

  let responseText = ''

  try {
    for (let turn = 0; turn < 5; turn++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools: [webSearchTool],
      })

      // Collect any text blocks from this turn
      const textBlocks: string[] = response.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.text)
      if (textBlocks.length) responseText = textBlocks.join('')

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        // Feed assistant message back and return empty tool results so the model can continue
        messages.push({ role: 'assistant', content: response.content })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolResults = response.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((b: any) => b.type === 'tool_use')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((b: any) => ({ type: 'tool_result', tool_use_id: b.id, content: '' }))
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }
  } catch (err) {
    console.error(
      `[social/insights] Claude API error sector=${sector} kind=${kind}:`,
      err instanceof Error ? err.message : err
    )
    return []
  }

  if (!responseText) {
    console.error(`[social/insights] No text in response sector=${sector} kind=${kind}`)
    return []
  }

  try {
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.error(
      `[social/insights] JSON parse failed sector=${sector} kind=${kind} raw:`,
      responseText.slice(0, 300)
    )
    return []
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind')
  if (kind !== 'dates' && kind !== 'trends') {
    return NextResponse.json({ error: 'Invalid kind — use "dates" or "trends"' }, { status: 400 })
  }

  // Sector, city, business_description from founder profile — never trusted from client
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founder_profiles?user_id=eq.${user.id}&select=sector,business_description,city`,
    { headers: sbHeaders }
  )
  const profiles = await profileRes.json()
  const sector: string | undefined = profiles?.[0]?.sector
  if (!sector) {
    return NextResponse.json({ error: 'Sector not set in founder profile' }, { status: 400 })
  }
  const city: string | undefined = profiles?.[0]?.city || undefined
  const businessDescription: string | undefined = profiles?.[0]?.business_description || undefined

  const cacheKey = buildCacheKey(sector, city)
  const cached = await getFromCache(cacheKey, kind)
  if (cached) {
    return NextResponse.json({ items: cached, fromCache: true })
  }

  const items = await generateContent(sector, kind, city, businessDescription)
  if (items.length > 0) {
    await saveToCache(cacheKey, kind, items)
  }

  return NextResponse.json({ items, fromCache: false })
}
