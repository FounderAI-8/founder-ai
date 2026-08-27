import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const UNSPLASH_API = 'https://api.unsplash.com'
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY!

// Ridotto (rispetto ai 30 di default di Unsplash): 15 immagini per pagina — abbastanza per
// riempire la griglia senza sprecare il rate limit demo (50 req/h).
const PER_PAGE = 15

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1

  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  const unsplashUrl =
    `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=${PER_PAGE}`

  let res: Response
  try {
    res = await fetch(unsplashUrl, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
    })
  } catch (err) {
    console.error('[social/unsplash] fetch error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Ricerca foto non riuscita' }, { status: 502 })
  }

  if (!res.ok) {
    const body = await res.text()
    console.error(`[social/unsplash] Unsplash search failed: status=${res.status} body=${body}`)
    return NextResponse.json({ error: 'Ricerca foto non riuscita' }, { status: res.status === 403 ? 429 : 502 })
  }

  const data = await res.json()
  const results = Array.isArray(data.results) ? data.results : []

  // Espone al client solo i campi effettivamente usati (thumbnail, immagine da inserire,
  // dati per l'attribuzione, download_location per il tracking obbligatorio).
  interface UnsplashPhoto {
    id: string
    urls: { regular: string; small: string }
    user: { name: string; links: { html: string } }
    links: { download_location: string }
  }
  const photos = results.map((p: UnsplashPhoto) => ({
    id: p.id,
    urlRegular: p.urls.regular,
    urlSmall: p.urls.small,
    photographerName: p.user.name,
    photographerUrl: p.user.links.html,
    downloadLocation: p.links.download_location,
  }))

  return NextResponse.json({
    photos,
    totalPages: data.total_pages ?? 0,
  })
}
