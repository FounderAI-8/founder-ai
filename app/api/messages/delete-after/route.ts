import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    Prefer: 'return=representation',
}

// POST /api/messages/delete-after — elimina tutti i messaggi di una chat con
// created_at >= afterCreatedAt (inclusivo). Usato dall'edit di un messaggio
// utente lato client: il messaggio in edit viene eliminato insieme a tutti quelli
// successivi, poi sendMessage lo re-inserisce con il nuovo testo e rigenera la
// risposta dell'assistant.
//
// POST invece di DELETE perché DELETE con body ha supporto irregolare tra client
// e proxy; il verbo semantico è comunque "delete" tramite il segmento URL.
export async function POST(req: NextRequest) {
    // Auth: stesso pattern di /api/messages/save e /api/social/disconnect.
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { chatId, afterCreatedAt } = await req.json()

    if (!chatId || !afterCreatedAt) {
        return NextResponse.json({ error: 'Missing chatId or afterCreatedAt' }, { status: 400 })
    }

    // Ownership check: la chat deve appartenere all'utente autenticato.
    // Doppia difesa oltre al filtro chat_id sulla DELETE — senza questo, un utente
    // con token valido potrebbe passare un chatId altrui e cancellarne i messaggi.
    const chatRes = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${user.id}&select=id`,
        { headers: sbHeaders }
    )
    const chatRows = await chatRes.json()
    if (!chatRows?.[0]) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    // DELETE con filtro esplicito su chat_id + created_at.
    // Prefer=return=representation restituisce le righe eliminate → count.
    const encodedAfter = encodeURIComponent(afterCreatedAt)
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/mentor_messages?chat_id=eq.${chatId}&created_at=gte.${encodedAfter}`,
        { method: 'DELETE', headers: sbHeaders }
    )

    if (!res.ok) {
        const err = await res.text()
        console.error(`/api/messages/delete-after failed [${res.status}]:`, err)
        return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 })
    }

    const deletedRows = await res.json()
    const deleted = Array.isArray(deletedRows) ? deletedRows.length : 0

    return NextResponse.json({ deleted })
}
