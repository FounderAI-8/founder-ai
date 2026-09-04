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

// POST /api/messages/save — insert a single mentor message.
// Il client chiama questo endpoint dopo lo streaming (sia in caso di completamento
// che di abort con testo parziale). Sposta il salvataggio del messaggio assistant
// dal server al client per rendere l'abort deterministico: se l'utente interrompe
// prima che qualsiasi token arrivi, il client non chiama questo endpoint e nulla
// viene persistito.
export async function POST(req: NextRequest) {
    // Auth: JWT nell'Authorization header, verificato lato server.
    // Stesso pattern di /api/social/disconnect (localStorage session, non cookie).
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { chatId, role, content } = await req.json()

    if (!chatId || !role || !content) {
        return NextResponse.json({ error: 'Missing chatId, role, or content' }, { status: 400 })
    }

    if (role !== 'user' && role !== 'assistant') {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
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

    const res = await fetch(`${SUPABASE_URL}/rest/v1/mentor_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ chat_id: chatId, session_id: chatId, role, content }),
    })

    if (!res.ok) {
        const err = await res.text()
        console.error(`/api/messages/save failed [${res.status}]:`, err)
        return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
