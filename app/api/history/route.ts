import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const BUCKET = 'mentor-attachments'
// TTL dei signed URL: 1 ora. Rigenerati ad ogni load della history.
// Se l'utente resta sulla stessa chat più a lungo, un reload aggiorna gli URL.
const SIGNED_URL_TTL_SECONDS = 3600

const sbHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
}

interface StoredAttachment {
    path: string
    type: 'image' | 'document'
    mime: string
    name: string
    size: number
}

interface MessageRow {
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
    attachments: StoredAttachment[] | null
}

// GET /api/history?chatId=X
// Restituisce i messaggi della chat ordinati per created_at asc.
// Ogni allegato viene arricchito con `url` (signed URL con TTL 1h) per il
// rendering client-side; il `path` originale rimane per riferimento.
//
// Auth JWT + ownership check aggiunti in PR3: prima l'endpoint era pubblico
// (chiunque conoscesse un chatId poteva leggerlo). Con gli allegati questo
// diventerebbe un leak di signed URL, quindi ora la history richiede JWT
// dell'owner della chat.
export async function GET(request: NextRequest) {
    const chatId = request.nextUrl.searchParams.get('chatId')
    if (!chatId) return NextResponse.json([], { status: 200 })

    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: { user } } = await authClient.auth.getUser(token)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ownership check: la chat deve appartenere all'utente autenticato.
    const chatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${user.id}&select=id`,
        { headers: sbHeaders }
    )
    const chatRows = await chatRes.json()
    if (!chatRows?.[0]) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/mentor_messages?chat_id=eq.${chatId}&order=created_at.asc&select=id,role,content,created_at,attachments`,
            { headers: sbHeaders }
        )

        if (!res.ok) return NextResponse.json([], { status: 200 })

        const rows = (await res.json()) as MessageRow[]
        if (!Array.isArray(rows)) return NextResponse.json([], { status: 200 })

        // Bulk-signing: raccogli tutti i path e firmali in una sola chiamata
        // (evita N round trip a Supabase per una chat con molti allegati).
        const allPaths: string[] = []
        for (const row of rows) {
            if (Array.isArray(row.attachments)) {
                for (const att of row.attachments) {
                    if (typeof att?.path === 'string') allPaths.push(att.path)
                }
            }
        }

        const pathToUrl = new Map<string, string>()
        if (allPaths.length > 0) {
            const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            const { data: signed } = await adminClient.storage
                .from(BUCKET)
                .createSignedUrls(allPaths, SIGNED_URL_TTL_SECONDS)
            if (signed) {
                for (const s of signed) {
                    if (s?.path && s?.signedUrl) {
                        pathToUrl.set(s.path, s.signedUrl)
                    }
                }
            }
        }

        const enriched = rows.map(row => ({
            ...row,
            attachments: Array.isArray(row.attachments)
                ? row.attachments.map(a => ({
                    ...a,
                    // url può essere null se la firma è fallita per quel path
                    // specifico — il client mostra un placeholder in quel caso.
                    url: pathToUrl.get(a.path) ?? null,
                }))
                : null,
        }))

        return NextResponse.json(enriched)
    } catch {
        return NextResponse.json([], { status: 200 })
    }
}
