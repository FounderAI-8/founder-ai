import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const BUCKET = 'mentor-attachments'

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DOC_MIMES = ['application/pdf']
const ALL_MIMES = [...IMAGE_MIMES, ...DOC_MIMES]

const MAX_IMAGE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_DOC_BYTES = 20 * 1024 * 1024     // 20 MB

const sbHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
}

// POST /api/attachments/create-upload
// Body: { chatId, filename, mime, size }
// Ritorna: { path, token }
//
// Il file NON transita da qui: Netlify functions ha un body limit di 6MB, un
// PDF da 20MB non passerebbe. Usiamo signed upload URL di Supabase: il server
// valida tutto (auth, ownership, MIME, size) e crea un token; il client fa PUT
// diretto a Supabase Storage con uploadToSignedUrl(path, token, file).
// Il bucket ha file_size_limit=20MB + allowed_mime_types come guardia extra
// enforced da Supabase indipendentemente da quello che dichiara il client.
export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: { user } } = await authClient.auth.getUser(token)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { chatId, filename, mime, size } = await req.json()

    if (!chatId || !filename || !mime || typeof size !== 'number') {
        return NextResponse.json(
            { error: 'Missing chatId, filename, mime, or size' },
            { status: 400 }
        )
    }

    if (!ALL_MIMES.includes(mime)) {
        return NextResponse.json({ error: `Unsupported MIME: ${mime}` }, { status: 415 })
    }

    const isImage = IMAGE_MIMES.includes(mime)
    const maxSize = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES
    if (size > maxSize) {
        const limitMB = isImage ? 10 : 20
        return NextResponse.json(
            { error: `File troppo grande (max ${limitMB} MB)` },
            { status: 413 }
        )
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

    // Path: {user_id}/{chat_id}/{uuid}-{filename sanitizzato}
    // Il prefix con user_id/chat_id rende ispezionabile l'ownership dal path
    // se in futuro aggiungiamo policy RLS su storage.objects.
    const uuid = randomUUID()
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100) || 'file'
    const path = `${user.id}/${chatId}/${uuid}-${sanitized}`

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data, error } = await adminClient.storage
        .from(BUCKET)
        .createSignedUploadUrl(path)

    if (error || !data) {
        console.error('/api/attachments/create-upload error:', error)
        return NextResponse.json({ error: 'Failed to create upload' }, { status: 500 })
    }

    return NextResponse.json({
        path,
        token: data.token,
    })
}
