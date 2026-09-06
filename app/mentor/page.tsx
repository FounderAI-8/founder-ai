'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Limiti allegati — client-side. Il server (/api/attachments/create-upload,
// /api/messages/save) ha gli stessi limiti come defense in depth; il bucket
// Supabase enforce ulteriormente via file_size_limit + allowed_mime_types.
const MAX_ATTACHMENTS_PER_MESSAGE = 3
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
const DOC_MIMES = ['application/pdf'] as const
const ACCEPT_MIMES = [...IMAGE_MIMES, ...DOC_MIMES].join(',')
const MAX_IMAGE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_DOC_BYTES = 20 * 1024 * 1024     // 20 MB

interface Attachment {
    path: string
    type: 'image' | 'document'
    mime: string
    name: string
    size: number
    // url: signed URL da history (TTL 1h) o blob: URL locale per anteprima
    // finché non arriva un fresh reload. Assente = non renderizzabile.
    url?: string | null
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    // id/created_at popolati dopo il salvataggio (da history o da /api/messages/save).
    // Assenti significa: messaggio non ancora persistito → non editabile.
    id?: string
    created_at?: string
    attachments?: Attachment[]
}

interface Chat {
    id: string
    title: string
    pinned: boolean
    created_at: string
}

export default function MentorPage() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const userIdRef = useRef<string | null>(null)

    const [chats, setChats] = useState<Chat[]>([])
    const [currentChatId, setCurrentChatId] = useState<string | null>(null)
    const currentChatIdRef = useRef<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)

    const [editingChatId, setEditingChatId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const titleInputRef = useRef<HTMLInputElement>(null)

    const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
    const [editingMessageText, setEditingMessageText] = useState('')
    const messageEditRef = useRef<HTMLTextAreaElement>(null)

    // Allegati in composer (pre-invio). url = blob: URL per anteprima locale.
    const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
    const [attachmentError, setAttachmentError] = useState<string | null>(null)
    const [uploadingAttachment, setUploadingAttachment] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [abortController, setAbortController] = useState<AbortController | null>(null)
    const [newChatPending, setNewChatPending] = useState(false)

    const bottomRef = useRef<HTMLDivElement>(null)
    const titleUpdatedRef = useRef(false)

    // ── init: get user, load chats ────────────────────────────────────────────

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) { window.location.href = '/auth/login'; return }
            const uid = data.user.id
            setUserId(uid)
            userIdRef.current = uid
            setUserEmail(data.user.email ?? null)
            initChats(uid)
        })
    }, [])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const prefill = params.get('prefill')
        if (prefill) {
            setInput(decodeURIComponent(prefill))
            window.history.replaceState(null, '', window.location.pathname)
        }
    }, [])

    const initChats = async (uid: string) => {
        let list: Chat[] = []
        try {
            const res = await fetch(`/api/chats?userId=${uid}`)
            if (res.ok) {
                const data = await res.json()
                if (Array.isArray(data)) list = data
            }
        } catch {
            // continua anche se la fetch fallisce
        }

        if (list.length === 0) {
            const created = await createChat(uid)
            if (created) list = [created]
        }

        setChats(list)
        if (list.length > 0) selectChat(list[0].id)
    }

    const createChat = async (uid?: string): Promise<Chat | null> => {
        const uidToUse = uid ?? userIdRef.current
        if (!uidToUse) return null
        const res = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uidToUse, title: 'Nuova chat' }),
        })
        if (!res.ok) return null
        return res.json()
    }

    // ── select chat: load history ─────────────────────────────────────────────

    const selectChat = async (chatId: string) => {
        setCurrentChatId(chatId)
        currentChatIdRef.current = chatId
        titleUpdatedRef.current = false
        setMessages([])

        // /api/history ora richiede JWT (aggiunto in PR3 insieme agli signed URL)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const res = await fetch(`/api/history?chatId=${chatId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const rows = await res.json()
        if (Array.isArray(rows) && rows.length > 0) {
            setMessages(rows.map((r: {
                id: string
                role: 'user' | 'assistant'
                content: string
                created_at: string
                attachments: Attachment[] | null
            }) => ({
                id: r.id,
                role: r.role,
                content: r.content,
                created_at: r.created_at,
                attachments: Array.isArray(r.attachments) ? r.attachments : undefined,
            })))
            titleUpdatedRef.current = true
        }
    }

    // ── new chat ──────────────────────────────────────────────────────────────

    const handleNewChat = async () => {
        setNewChatPending(true)
        try {
            const newChat = await createChat()
            if (!newChat) return
            setChats(prev => [newChat, ...prev])
            // await: setNewChatPending(false) nel finally deve scattare SOLO dopo
            // che selectChat ha aggiornato ref, state e caricato la history.
            await selectChat(newChat.id)
        } finally {
            setNewChatPending(false)
        }
    }

    // ── scroll to bottom ──────────────────────────────────────────────────────

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    // ── send message ──────────────────────────────────────────────────────────

    // textArg: usato dal flusso di edit-and-regenerate (bypassa lo state input)
    // attachmentsArg: usato dall'edit per preservare gli allegati originali del
    // messaggio in modifica (bypassa pendingAttachments dello state composer).
    const sendMessage = async (textArg?: string, attachmentsArg?: Attachment[]) => {
        if (loading || newChatPending || !currentChatIdRef.current) return
        const text = (textArg ?? input).trim()
        if (!text) return

        if (!textArg) setInput('')
        setLoading(true)

        const controller = new AbortController()
        setAbortController(controller)

        // Snapshot del chatId: se l'utente cambia chat durante lo streaming, il
        // salvataggio (anche di un parziale in caso di abort) deve comunque
        // finire nella chat originale del send.
        const chatIdAtSend = currentChatIdRef.current

        // Attachments: dall'edit (attachmentsArg) o dal composer (pendingAttachments)
        const attachmentsToSend: Attachment[] = attachmentsArg ?? pendingAttachments

        // Optimistic UI: user bubble (con attachments se presenti) + empty assistant
        setMessages(prev => [
            ...prev,
            {
                role: 'user',
                content: text,
                ...(attachmentsToSend.length > 0 ? { attachments: attachmentsToSend } : {}),
            },
            { role: 'assistant', content: '' },
        ])

        // Salvataggio user PRIMA di chiamare /api/chat: se fallisce, rollback delle
        // due bubble ottimistiche, ripristino dell'input, e errore visibile in chat
        // (mai un messaggio "fantasma" in UI senza corrispondente in DB).
        const userSaved = await saveMessageToDb(
            chatIdAtSend,
            'user',
            text,
            attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        )
        if (!userSaved) {
            setMessages(prev => {
                const copy = prev.slice(0, -2)
                copy.push({
                    role: 'assistant',
                    content: 'Non sono riuscito a salvare il tuo messaggio. Verifica la connessione e riprova.',
                })
                return copy
            })
            if (!textArg) setInput(text)
            // pendingAttachments NON viene svuotato — l'utente ritenta col composer intatto.
            setLoading(false)
            setAbortController(null)
            return
        }

        // Save ok: se era un fresh send (non edit), svuota il composer.
        // Non revochiamo i blob URL: sono ancora referenziati dalla bubble
        // ottimistica in messages state, moriranno all'unload della pagina.
        if (!attachmentsArg && pendingAttachments.length > 0) {
            setPendingAttachments([])
        }

        // Aggiorna la user bubble (penultima) con id/created_at reali
        setMessages(prev => {
            const copy = [...prev]
            const idx = copy.length - 2
            if (copy[idx]?.role === 'user') {
                copy[idx] = { ...copy[idx], id: userSaved.id, created_at: userSaved.created_at }
            }
            return copy
        })

        let assistantText = ''

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    chatId: chatIdAtSend,
                    userId: userIdRef.current,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                const errorMessage = errorData?.error ?? 'Sloan non è riuscito a rispondere, riprova tra poco.'
                setMessages(prev => {
                    const copy = [...prev]
                    copy[copy.length - 1] = { ...copy[copy.length - 1], content: errorMessage }
                    return copy
                })
                return
            }

            if (!response.body) throw new Error('No response body')

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                assistantText += chunk
                setMessages(prev => {
                    const copy = [...prev]
                    const last = copy[copy.length - 1]
                    copy[copy.length - 1] = { ...last, content: last.content + chunk }
                    return copy
                })
            }

            // Streaming completato: salva assistant + aggiorna la bubble con id/created_at
            if (assistantText) {
                const assistantSaved = await saveMessageToDb(chatIdAtSend, 'assistant', assistantText)
                if (assistantSaved) {
                    setMessages(prev => {
                        const copy = [...prev]
                        const idx = copy.length - 1
                        if (copy[idx]?.role === 'assistant') {
                            copy[idx] = { ...copy[idx], id: assistantSaved.id, created_at: assistantSaved.created_at }
                        }
                        return copy
                    })
                }
            }

            if (!titleUpdatedRef.current) {
                titleUpdatedRef.current = true
                const words = text.trim().split(/\s+/).slice(0, 6).join(' ')
                const title = words.length < text.trim().length ? words + '…' : words
                await updateChatTitle(chatIdAtSend, title)
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Abort utente: salva il parziale (contract WYSIWYG) + aggiorna id
                if (assistantText) {
                    saveMessageToDb(chatIdAtSend, 'assistant', assistantText).then(assistantSaved => {
                        if (assistantSaved) {
                            setMessages(prev => {
                                const copy = [...prev]
                                const idx = copy.length - 1
                                if (copy[idx]?.role === 'assistant') {
                                    copy[idx] = { ...copy[idx], id: assistantSaved.id, created_at: assistantSaved.created_at }
                                }
                                return copy
                            })
                        }
                    })
                }
                // Rimuove la bubble assistant vuota se nessun token è arrivato
                setMessages(prev => {
                    const last = prev[prev.length - 1]
                    if (last.role === 'assistant' && last.content === '') {
                        return prev.slice(0, -1)
                    }
                    return prev
                })
            } else {
                // Network or unexpected error — show error in the assistant bubble
                setMessages(prev => {
                    const copy = [...prev]
                    const last = copy[copy.length - 1]
                    if (last.role === 'assistant' && last.content === '') {
                        copy[copy.length - 1] = { ...last, content: 'Errore di connessione.' }
                    }
                    return copy
                })
            }
        } finally {
            setLoading(false)
            setAbortController(null)
        }
    }

    const handleInterrompi = () => abortController?.abort()

    // ── update title ──────────────────────────────────────────────────────────

    const updateChatTitle = async (chatId: string, title: string) => {
        const res = await fetch('/api/chats', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, title }),
        })
        if (!res.ok) return
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
    }

    // ── save message (client-driven) ──────────────────────────────────────────
    // Salva user o assistant tramite lo stesso endpoint autenticato. Ritorna
    // { id, created_at } della riga inserita, o null se fallisce — il caller
    // decide come gestire il fallimento (mai in silenzio).
    const saveMessageToDb = async (
        chatId: string,
        role: 'user' | 'assistant',
        content: string,
        attachments?: Attachment[],
    ): Promise<{ id: string; created_at: string } | null> => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return null

        // Strippa `url` prima di inviare al server: la colonna DB memorizza
        // solo path/type/mime/name/size (gli URL sono ephemeral, firmati on-demand).
        const attachmentsForServer = attachments && attachments.length > 0
            ? attachments.map(({ path, type, mime, name, size }) => ({ path, type, mime, name, size }))
            : undefined

        try {
            const res = await fetch('/api/messages/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    chatId,
                    role,
                    content,
                    ...(attachmentsForServer ? { attachments: attachmentsForServer } : {}),
                }),
            })
            if (!res.ok) return null
            const data = await res.json()
            if (typeof data?.id === 'string' && typeof data?.created_at === 'string') {
                return { id: data.id, created_at: data.created_at }
            }
            return null
        } catch {
            return null
        }
    }

    // ── attachments (client-driven upload flow) ───────────────────────────────
    // Flow: file picker → validazione client → POST /api/attachments/create-upload
    // (auth + ownership + validazione server) → upload diretto a Supabase Storage
    // con uploadToSignedUrl (bypassa il body limit 4.5MB delle Vercel functions).

    const uploadAttachment = async (chatId: string, file: File): Promise<Attachment | null> => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return null
        try {
            const createRes = await fetch('/api/attachments/create-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    chatId,
                    filename: file.name,
                    mime: file.type,
                    size: file.size,
                }),
            })
            if (!createRes.ok) return null
            const { path, token } = await createRes.json()
            if (typeof path !== 'string' || typeof token !== 'string') return null

            const { error } = await supabase.storage
                .from('mentor-attachments')
                .uploadToSignedUrl(path, token, file, { contentType: file.type })
            if (error) return null

            const isImage = (IMAGE_MIMES as readonly string[]).includes(file.type)
            return {
                path,
                type: isImage ? 'image' : 'document',
                mime: file.type,
                name: file.name,
                size: file.size,
                // blob: URL per anteprima locale in composer e nella bubble
                // finché non arriva un fresh reload della history.
                url: URL.createObjectURL(file),
            }
        } catch {
            return null
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        // Reset input value così l'utente può ri-selezionare lo stesso file
        e.target.value = ''
        if (files.length === 0) return
        setAttachmentError(null)

        // Client-side validation prima di uploadare qualsiasi cosa
        if (pendingAttachments.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
            setAttachmentError(`Massimo ${MAX_ATTACHMENTS_PER_MESSAGE} allegati per messaggio.`)
            return
        }
        for (const file of files) {
            const isImage = (IMAGE_MIMES as readonly string[]).includes(file.type)
            const isDoc = (DOC_MIMES as readonly string[]).includes(file.type)
            if (!isImage && !isDoc) {
                setAttachmentError(`Formato non supportato: ${file.name}. Consentiti: JPG, PNG, GIF, WEBP, PDF.`)
                return
            }
            const max = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES
            if (file.size > max) {
                const limitMB = isImage ? 10 : 20
                setAttachmentError(`${file.name} è troppo grande (max ${limitMB} MB).`)
                return
            }
        }

        if (!currentChatIdRef.current) {
            setAttachmentError('Nessuna chat attiva.')
            return
        }
        const chatIdAtUpload = currentChatIdRef.current

        setUploadingAttachment(true)
        try {
            for (const file of files) {
                const uploaded = await uploadAttachment(chatIdAtUpload, file)
                if (!uploaded) {
                    setAttachmentError(`Errore nell'upload di ${file.name}. Riprova.`)
                    return
                }
                setPendingAttachments(prev => [...prev, uploaded])
            }
        } finally {
            setUploadingAttachment(false)
        }
    }

    const removePendingAttachment = (index: number) => {
        setPendingAttachments(prev => {
            const removed = prev[index]
            if (removed?.url?.startsWith('blob:')) URL.revokeObjectURL(removed.url)
            return prev.filter((_, i) => i !== index)
        })
        setAttachmentError(null)
    }

    // ── toggle pin ────────────────────────────────────────────────────────────

    const togglePin = async (e: React.MouseEvent, chat: Chat) => {
        e.stopPropagation()
        const res = await fetch('/api/chats', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: chat.id, pinned: !chat.pinned }),
        })
        if (!res.ok) return
        setChats(prev => {
            const updated = prev.map(c => c.id === chat.id ? { ...c, pinned: !c.pinned } : c)
            return [...updated].sort((a, b) => {
                if (a.pinned === b.pinned) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                return a.pinned ? -1 : 1
            })
        })
    }

    // ── inline rename ─────────────────────────────────────────────────────────

    const startEditing = (e: React.MouseEvent, chat: Chat) => {
        e.stopPropagation()
        setEditingChatId(chat.id)
        setEditingTitle(chat.title)
        setTimeout(() => titleInputRef.current?.focus(), 0)
    }

    const commitRename = async () => {
        if (!editingChatId || !editingTitle.trim()) {
            setEditingChatId(null)
            return
        }
        await updateChatTitle(editingChatId, editingTitle.trim())
        setEditingChatId(null)
    }

    // ── message editing (edit + regenerate) ───────────────────────────────────

    const startMessageEdit = (index: number, currentContent: string) => {
        setEditingMessageIndex(index)
        setEditingMessageText(currentContent)
        setTimeout(() => messageEditRef.current?.focus(), 0)
    }

    const cancelMessageEdit = () => {
        setEditingMessageIndex(null)
        setEditingMessageText('')
    }

    const commitMessageEdit = async () => {
        if (editingMessageIndex === null) return
        const newText = editingMessageText.trim()
        if (!newText) return

        const msg = messages[editingMessageIndex]
        if (!msg?.created_at || !currentChatIdRef.current) {
            cancelMessageEdit()
            return
        }

        // Snapshot PRIMA del confirm dialog (window.confirm blocca sincronamente
        // e nel frattempo l'utente potrebbe cambiare chat via sidebar).
        const chatIdForEdit = currentChatIdRef.current
        const afterCreatedAt = msg.created_at
        const editIndex = editingMessageIndex

        if (!window.confirm('I messaggi successivi verranno eliminati. Continuare?')) return

        // Se la chat è cambiata durante il confirm, interrompi: non vogliamo
        // rischiare un delete/rigenerazione su una chat che l'utente non sta
        // più guardando.
        if (currentChatIdRef.current !== chatIdForEdit) {
            alert('Chat cambiata durante la modifica, operazione annullata.')
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
            alert('Sessione scaduta, ricarica la pagina.')
            return
        }

        try {
            const res = await fetch('/api/messages/delete-after', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ chatId: chatIdForEdit, afterCreatedAt }),
            })
            if (!res.ok) {
                alert('Non sono riuscito a eliminare i messaggi. Riprova.')
                return
            }
        } catch {
            alert('Errore di rete durante l\'eliminazione.')
            return
        }

        // Snapshot degli allegati originali del messaggio in edit prima di
        // rimuoverlo dallo state — vanno preservati nel messaggio rigenerato
        // (l'utente ha modificato solo il testo, gli allegati restano gli stessi).
        const originalAttachments = msg.attachments

        // Rimuovi dal state locale il messaggio in edit + tutti i successivi;
        // sendMessage(newText, originalAttachments) re-inserirà il messaggio
        // user modificato con gli stessi allegati e rigenererà la risposta.
        setMessages(prev => prev.slice(0, editIndex))
        setEditingMessageIndex(null)
        setEditingMessageText('')

        sendMessage(newText, originalAttachments)
    }

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#0a0c1a] text-white flex flex-row">

            {/* ── Sidebar ── */}
            {sidebarOpen && (
                <aside className="w-64 flex-shrink-0 bg-[#07091a] border-r border-[#1e2340] flex flex-col">
                    <div className="px-4 py-4 border-b border-[#1e2340] flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-300">Le tue chat</span>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="text-gray-500 hover:text-white text-xs"
                            title="Chiudi sidebar"
                        >
                            ✕
                        </button>
                    </div>

                    <button
                        onClick={handleNewChat}
                        className="mx-3 mt-3 mb-2 py-2 rounded-xl border border-[#1e2340] text-sm text-gray-400 hover:text-white hover:border-[#3B5BDB] transition-colors text-center"
                    >
                        + Nuova chat
                    </button>

                    <div className="flex-1 overflow-y-auto py-2">
                        {chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => selectChat(chat.id)}
                                onDoubleClick={e => startEditing(e, chat)}
                                className={`mx-2 mb-1 px-3 py-2 rounded-xl cursor-pointer flex items-center gap-2 group transition-colors ${
                                    currentChatId === chat.id
                                        ? 'bg-[#1e2340] text-white'
                                        : 'text-gray-400 hover:bg-[#0f1229] hover:text-white'
                                }`}
                            >
                                {editingChatId === chat.id ? (
                                    <input
                                        ref={titleInputRef}
                                        value={editingTitle}
                                        onChange={e => setEditingTitle(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') commitRename()
                                            if (e.key === 'Escape') setEditingChatId(null)
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        className="flex-1 bg-transparent border-b border-[#3B5BDB] outline-none text-sm text-white"
                                    />
                                ) : (
                                    <span className="flex-1 text-sm truncate">{chat.title}</span>
                                )}

                                <button
                                    onClick={e => togglePin(e, chat)}
                                    className={`flex-shrink-0 text-xs transition-opacity ${
                                        chat.pinned
                                            ? 'text-[#5C7CFA] opacity-100'
                                            : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-[#5C7CFA]'
                                    }`}
                                    title={chat.pinned ? 'Rimuovi pin' : 'Pinna chat'}
                                >
                                    📌
                                </button>
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {/* ── Main area ── */}
            <div className="flex-1 flex flex-col min-w-0">
                <nav className="border-b border-[#1e2340] px-6 py-4 flex items-center gap-4">
                    <Link href="/" className="flex-shrink-0">
                        <Image
                            src="/Fouderailogobianco_transparent.png"
                            alt="FounderAI"
                            height={32}
                            width={105}
                            className="object-contain h-6 w-auto sm:h-8"
                            priority
                        />
                    </Link>
                    {!sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="text-gray-400 hover:text-white text-sm"
                            title="Apri sidebar"
                        >
                            ☰
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-4">
                        <a href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</a>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setMenuOpen(o => !o)}
                                className="w-8 h-8 rounded-full bg-[#534AB7] text-white text-xs font-semibold flex items-center justify-center hover:bg-[#6B63C8] transition-colors"
                                title="Account"
                            >
                                {userEmail ? userEmail[0].toUpperCase() : '?'}
                            </button>
                            {menuOpen && (
                                <div
                                    className="absolute right-0 top-10 bg-[#0f1229] border border-[#1e2340] rounded-xl py-1 z-50"
                                    style={{ minWidth: 152 }}
                                >
                                    <Link
                                        href="/profile"
                                        onClick={() => setMenuOpen(false)}
                                        className="block px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#1e2340]"
                                    >
                                        Profilo
                                    </Link>
                                    <button
                                        onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login' }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#1e2340]"
                                    >
                                        Esci
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </nav>

                <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl mx-auto w-full">
                    {messages.length === 0 && !loading && (
                        <div className="text-center mt-24">
                            <p className="text-2xl font-bold mb-2">Ciao, sono il tuo Mentor.</p>
                            <p className="text-gray-400">Dimmi su cosa stai lavorando.</p>
                        </div>
                    )}

                    {messages.map((msg, i) => {
                        const isEditing = editingMessageIndex === i
                        const canEdit = msg.role === 'user' && !!msg.created_at && !loading && editingMessageIndex === null
                        return (
                            <div key={msg.id ?? `local-${i}`} className={`mb-6 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`group relative max-w-xl px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-[#3B5BDB] text-white'
                                        : 'bg-[#0f1229] border border-[#1e2340] text-gray-200'
                                }`}>
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2 min-w-[280px]">
                                            <textarea
                                                ref={messageEditRef}
                                                value={editingMessageText}
                                                onChange={e => setEditingMessageText(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Escape') cancelMessageEdit()
                                                }}
                                                rows={3}
                                                className="w-full bg-transparent border border-white/30 rounded-lg px-3 py-2 text-white text-sm resize-y outline-none focus:border-white/60"
                                            />
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    onClick={cancelMessageEdit}
                                                    className="text-xs px-3 py-1 rounded-lg border border-white/40 text-white hover:bg-white/10 transition-colors"
                                                >
                                                    Annulla
                                                </button>
                                                <button
                                                    onClick={commitMessageEdit}
                                                    disabled={!editingMessageText.trim()}
                                                    className="text-xs px-3 py-1 rounded-lg bg-white text-[#3B5BDB] font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    Salva e rigenera
                                                </button>
                                            </div>
                                        </div>
                                    ) : msg.role === 'assistant' && loading && i === messages.length - 1 && msg.content === '' ? (
                                        <span className="text-gray-500">Il mentor sta pensando...</span>
                                    ) : (
                                        <>
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {msg.attachments.map((att, ai) => (
                                                        att.type === 'image' && att.url ? (
                                                            <a
                                                                key={ai}
                                                                href={att.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <img
                                                                    src={att.url}
                                                                    alt={att.name}
                                                                    className="max-h-40 max-w-[240px] rounded-lg border border-white/20 object-cover hover:opacity-90 transition-opacity"
                                                                />
                                                            </a>
                                                        ) : (
                                                            <a
                                                                key={ai}
                                                                href={att.url ?? '#'}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-xs hover:bg-white/20 max-w-[240px] transition-colors"
                                                                title={att.name}
                                                            >
                                                                <span>📄</span>
                                                                <span className="truncate">{att.name}</span>
                                                            </a>
                                                        )
                                                    ))}
                                                </div>
                                            )}
                                            {msg.content.split('\n\n').map((para, j) => (
                                                <p key={j} className={j > 0 ? 'mt-3' : ''}>{para}</p>
                                            ))}
                                            {canEdit && (
                                                <button
                                                    onClick={() => startMessageEdit(i, msg.content)}
                                                    className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white text-sm transition-opacity"
                                                    title="Modifica messaggio"
                                                >
                                                    ✏️
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <div ref={bottomRef} />
                </div>

                <div className="border-t border-[#1e2340] px-8 py-4 max-w-3xl mx-auto w-full">
                    {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {pendingAttachments.map((att, i) => (
                                <div key={i} className="relative">
                                    {att.type === 'image' && att.url ? (
                                        <img
                                            src={att.url}
                                            alt={att.name}
                                            className="h-16 w-16 rounded-lg object-cover border border-[#1e2340]"
                                        />
                                    ) : (
                                        <div className="h-16 min-w-[120px] max-w-[220px] rounded-lg bg-[#0f1229] border border-[#1e2340] px-3 flex items-center gap-2 text-xs text-gray-300">
                                            <span>📄</span>
                                            <span className="truncate">{att.name}</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => removePendingAttachment(i)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center hover:bg-red-500"
                                        title="Rimuovi allegato"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {attachmentError && (
                        <div className="text-red-400 text-xs mb-2">{attachmentError}</div>
                    )}
                    <div className="flex gap-3">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading || uploadingAttachment || pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                            className="flex-shrink-0 bg-[#0f1229] border border-[#1e2340] text-gray-400 hover:text-white rounded-xl px-4 py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title={
                                pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE
                                    ? `Massimo ${MAX_ATTACHMENTS_PER_MESSAGE} allegati per messaggio`
                                    : uploadingAttachment ? 'Upload in corso…' : 'Allega file'
                            }
                        >
                            {uploadingAttachment ? '⏳' : '📎'}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPT_MIMES}
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            placeholder="Scrivi al tuo mentor..."
                            className="flex-1 bg-[#0f1229] border border-[#1e2340] text-white rounded-xl px-4 py-3 outline-none focus:border-[#3B5BDB] text-sm"
                        />
                        {loading ? (
                            <button
                                onClick={handleInterrompi}
                                className="bg-red-700 text-white rounded-xl px-6 py-3 font-medium hover:bg-red-600 transition-colors"
                            >
                                ■ Interrompi
                            </button>
                        ) : (
                            <button
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || !currentChatId || newChatPending || uploadingAttachment}
                                className="bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-medium hover:bg-[#5C7CFA] transition-colors disabled:opacity-40"
                            >
                                →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
