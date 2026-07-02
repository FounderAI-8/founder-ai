import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkzgisgrbipbnaogeryw.supabase.co'
// Route server-side: usa la service role key (bypassa RLS) perché qui non
// giunge il JWT dell'utente — con la anon key ogni insert/select su `chats`
// veniva rifiutato dalla row-level security (42501). La route stessa scopa
// già le query per userId/chatId passato dal client autenticato.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: 'return=representation',
}

// GET /api/chats?userId=xxx — list all chats for a user
// POST /api/chats — create a new chat
// PATCH /api/chats — update title or pinned status
export async function GET(req: NextRequest) {
    const userId = req.nextUrl.searchParams.get('userId')

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?user_id=eq.${userId}&order=pinned.desc,created_at.desc&select=id,title,pinned,created_at`,
        { headers: sbHeaders }
    )

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    return NextResponse.json(await res.json())
}

export async function POST(req: NextRequest) {
    const { userId, title } = await req.json()

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/chats`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ user_id: userId, title: title ?? 'Nuova chat', pinned: false }),
    })

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    const rows = await res.json()
    return NextResponse.json(rows[0])
}

export async function PATCH(req: NextRequest) {
    const { chatId, title, pinned } = await req.json()

    if (!chatId) {
        return NextResponse.json({ error: 'Missing chatId' }, { status: 400 })
    }

    const body: Record<string, unknown> = {}
    if (title !== undefined) body.title = title
    if (pinned !== undefined) body.pinned = pinned

    if (Object.keys(body).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`,
        {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify(body),
        }
    )

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    const rows = await res.json()
    return NextResponse.json(rows[0])
}
