import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET!

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const USER_PROMPTS: Record<string, (sector: string) => string> = {
  dates: (sector) =>
    `Identifica le 8-10 date/eventi più rilevanti nei prossimi 3 mesi per un'attività nel settore ${sector} in Italia — sia ricorrenze fisse (festività, giornate mondiali, eventi commerciali come Black Friday) sia eventi variabili che richiedono una ricerca aggiornata (eventi sportivi, culturali, di attualità) SE rilevanti per questo tipo di business specifico. Per ciascuna data fornisci: la data esatta, cosa succede, perché conta per questo settore, un suggerimento pratico concreto. Rispondi in formato JSON: un array di oggetti con i campi date, title, why_relevant, suggestion.`,
  trends: (sector) =>
    `Identifica 6-8 trend di contenuto attuali su Instagram, TikTok e YouTube, riadattati per un'attività nel settore ${sector}. Per ciascuno: piattaforma, in cosa consiste il trend, come un'attività di questo settore potrebbe usarlo concretamente. Rispondi in formato JSON: un array di oggetti con i campi platform, trend_title, description, how_to_use.`,
}

const SYSTEM_PROMPT =
  'Sei un esperto di marketing e social media in Italia. Usa il web_search tool per cercare informazioni aggiornate. Rispondi sempre e solo con JSON valido (array), senza markdown, senza backtick, senza preamboli o spiegazioni.'

async function generateContent(sector: string, kind: string): Promise<unknown[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webSearchTool: any = { type: 'web_search_20250305', name: 'web_search' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: USER_PROMPTS[kind](sector) }]
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlocks: string[] = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text)
      if (textBlocks.length) responseText = textBlocks.join('')

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
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
      `[social/insights/refresh] Claude API error sector=${sector} kind=${kind}:`,
      err instanceof Error ? err.message : err
    )
    return []
  }

  if (!responseText) return []

  try {
    const cleaned = responseText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.error(
      `[social/insights/refresh] JSON parse failed sector=${sector} kind=${kind} raw:`,
      responseText.slice(0, 300)
    )
    return []
  }
}

async function saveToCache(sector: string, kind: string, items: unknown[]) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sector_content_cache`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ sector, kind, items, updated_at: new Date().toISOString() }),
    })
  } catch (err) {
    console.error(
      `[social/insights/refresh] saveToCache failed sector=${sector} kind=${kind}:`,
      err instanceof Error ? err.message : err
    )
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const secret = authHeader?.replace('Bearer ', '')
  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind')
  if (kind !== 'dates' && kind !== 'trends') {
    return NextResponse.json({ error: 'Invalid kind — use "dates" or "trends"' }, { status: 400 })
  }

  // Fetch all distinct sectors currently in use
  const sectorsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founder_profiles?select=sector&sector=not.is.null`,
    { headers: sbHeaders }
  )
  const rows: Array<{ sector: string }> = await sectorsRes.json()
  const sectors = [...new Set(rows.map(r => r.sector).filter(Boolean))]

  if (!sectors.length) {
    return NextResponse.json({ updated: 0, sectors: [] })
  }

  const results: Array<{ sector: string; ok: boolean }> = []

  for (const sector of sectors) {
    const items = await generateContent(sector, kind)
    if (items.length > 0) {
      await saveToCache(sector, kind, items)
      results.push({ sector, ok: true })
    } else {
      results.push({ sector, ok: false })
    }
  }

  const updated = results.filter(r => r.ok).length
  console.log(`[social/insights/refresh] kind=${kind} updated=${updated}/${sectors.length}`)

  return NextResponse.json({ updated, total: sectors.length, results })
}
