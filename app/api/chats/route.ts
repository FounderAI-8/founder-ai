import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkzgisgrbipbnaogeryw.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: 'return=representation',
}

async function authenticate(req: NextRequest) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return null
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: { user } } = await supabase.auth.getUser(token)
    return user ?? null
}

// GET /api/chats — list all chats for the authenticated user
// POST /api/chats — create a new chat
// PATCH /api/chats — update title or pinned status (ownership enforced)
export async function GET(req: NextRequest) {
    const user = await authenticate(req)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?user_id=eq.${user.id}&order=pinned.desc,created_at.desc&select=id,title,pinned,created_at`,
        { headers: sbHeaders }
    )

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    return NextResponse.json(await res.json())
}

export async function POST(req: NextRequest) {
    const user = await authenticate(req)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let title: string | undefined
    try {
        const body = await req.json()
        title = body?.title
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/chats`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ user_id: user.id, title: title ?? 'Nuova chat', pinned: false }),
    })

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    const rows = await res.json()
    return NextResponse.json(rows[0])
}

export async function PATCH(req: NextRequest) {
    const user = await authenticate(req)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let chatId: string | undefined
    let title: unknown
    let pinned: unknown
    try {
        const body = await req.json()
        chatId = body?.chatId
        title = body?.title
        pinned = body?.pinned
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!chatId) {
        return NextResponse.json({ error: 'Missing chatId' }, { status: 400 })
    }

    const updateBody: Record<string, unknown> = {}
    if (title !== undefined) updateBody.title = title
    if (pinned !== undefined) updateBody.pinned = pinned

    if (Object.keys(updateBody).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}&user_id=eq.${user.id}`,
        {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify(updateBody),
        }
    )

    if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err }, { status: res.status })
    }

    const rows = await res.json()
    if (!rows[0]) {
        return NextResponse.json({ error: 'Not found or forbidden' }, { status: 403 })
    }
    return NextResponse.json(rows[0])
}
