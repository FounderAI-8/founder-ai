import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = 'https://nkzgisgrbipbnaogeryw.supabase.co'
// Route server-side: service role key, stesso motivo di app/api/chats/route.ts.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
    const chatId = request.nextUrl.searchParams.get('chatId')

    if (!chatId) {
        return NextResponse.json([], { status: 200 })
    }

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/mentor_messages?chat_id=eq.${chatId}&order=created_at.asc&select=id,role,content,created_at`,
            {
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                },
            }
        )

        if (!res.ok) return NextResponse.json([], { status: 200 })

        const rows = await res.json()

        if (!Array.isArray(rows)) return NextResponse.json([], { status: 200 })

        return NextResponse.json(rows)
    } catch {
        return NextResponse.json([], { status: 200 })
    }
}
