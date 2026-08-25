import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ZERNIO_API = 'https://zernio.com/api/v1'
const ZERNIO_KEY = process.env.ZERNIO_API_KEY!

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64 } = await req.json()
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
    return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 })
  }

  const base64Payload = imageBase64.startsWith('data:')
    ? imageBase64.slice(imageBase64.indexOf(',') + 1)
    : imageBase64

  const imageBuffer = Buffer.from(base64Payload, 'base64')
  if (imageBuffer.length === 0) {
    return NextResponse.json({ error: 'Invalid imageBase64' }, { status: 400 })
  }

  const filename = `composite-${Date.now()}.png`

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
      console.error(`[social/composite-image] Zernio presign failed: status=${presignRes.status} body=${body}`)
      return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
    }
    const presignData = await presignRes.json()
    uploadUrl = presignData.uploadUrl
    publicUrl = presignData.publicUrl
  } catch (err) {
    console.error('[social/composite-image] Zernio presign error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
  }

  try {
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: imageBuffer,
    })
    if (!putRes.ok) {
      console.error(`[social/composite-image] PUT to uploadUrl failed: status=${putRes.status}`)
      return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
    }
  } catch (err) {
    console.error('[social/composite-image] PUT error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Upload immagine non riuscito' }, { status: 502 })
  }

  return NextResponse.json({ imageUrl: publicUrl })
}
