import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ZERNIO_API = 'https://zernio.com/api/v1'
const ZERNIO_KEY = process.env.ZERNIO_API_KEY!

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt } = await req.json()
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
  }

  let b64: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await openai.images.generate({
      model: 'gpt-image-1-mini' as any,
      quality: 'low' as any,
      prompt: `${prompt.trim()}. Non includere testo, scritte o frasi nell'immagine — se proprio necessario, al massimo una singola parola breve. Concentrati su elementi visivi, colori, composizione.`,
    })
    b64 = response.data[0].b64_json as string
  } catch (err) {
    console.error('[social/generate-image] OpenAI error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Generazione immagine non riuscita' }, { status: 502 })
  }

  const imageBuffer = Buffer.from(b64, 'base64')
  const filename = `post-${Date.now()}.png`

  let uploadUrl: string
  let publicUrl: string
  try {
    const presignRes = await fetch(`${ZERNIO_API}/media/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZERNIO_KEY}`,
      },
      body: JSON.stringify({ filename, contentType: 'image/png' }),
    })
    if (!presignRes.ok) {
      const body = await presignRes.text()
      console.error(`[social/generate-image] Zernio presign failed: status=${presignRes.status} body=${body}`)
      return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
    }
    const presignData = await presignRes.json()
    uploadUrl = presignData.uploadUrl
    publicUrl = presignData.publicUrl
  } catch (err) {
    console.error('[social/generate-image] Zernio presign error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
  }

  try {
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: imageBuffer,
    })
    if (!putRes.ok) {
      console.error(`[social/generate-image] PUT to uploadUrl failed: status=${putRes.status}`)
      return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
    }
  } catch (err) {
    console.error('[social/generate-image] PUT error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
  }

  return NextResponse.json({ imageUrl: publicUrl })
}
