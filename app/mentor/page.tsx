'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Message {
    role: 'user' | 'assistant'
    content: string
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

    const [editingChatId, setEditingChatId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const titleInputRef = useRef<HTMLInputElement>(null)

    const bottomRef = useRef<HTMLDivElement>(null)
    const titleUpdatedRef = useRef(false)

    // ── init: get user, load chats ────────────────────────────────────────────

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) return
            const uid = data.user.id
            setUserId(uid)
            userIdRef.current = uid
            initChats(uid)
        })
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

        const res = await fetch(`/api/history?chatId=${chatId}`)
        if (!res.ok) return
        const rows = await res.json()
        if (Array.isArray(rows) && rows.length > 0) {
            setMessages(rows.map((r: { role: 'user' | 'assistant'; content: string }) => ({
                role: r.role,
                content: r.content,
            })))
            titleUpdatedRef.current = true
        }
    }

    // ── new chat ──────────────────────────────────────────────────────────────

    const handleNewChat = async () => {
        const newChat = await createChat()
        if (!newChat) return
        setChats(prev => [newChat, ...prev])
        selectChat(newChat.id)
    }

    // ── scroll to bottom ──────────────────────────────────────────────────────

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    // ── send message ──────────────────────────────────────────────────────────

    const sendMessage = async () => {
        if (!input.trim() || loading || !currentChatIdRef.current) return

        const text = input.trim()
        setMessages(prev => [...prev, { role: 'user', content: text }])
        setInput('')
        setLoading(true)

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    chatId: currentChatIdRef.current,
                    userId: userIdRef.current,
                }),
            })

            const data = await response.json()
            setMessages(prev => [...prev, { role: 'assistant', content: data.message }])

            if (!titleUpdatedRef.current) {
                titleUpdatedRef.current = true
                const words = text.trim().split(/\s+/).slice(0, 6).join(' ')
                const title = words.length < text.trim().length ? words + '…' : words
                await updateChatTitle(currentChatIdRef.current!, title)
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }])
        } finally {
            setLoading(false)
        }
    }

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
                    <a href="/dashboard" className="text-gray-400 hover:text-white text-sm ml-auto">← Dashboard</a>
                </nav>

                <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl mx-auto w-full">
                    {messages.length === 0 && !loading && (
                        <div className="text-center mt-24">
                            <p className="text-2xl font-bold mb-2">Ciao, sono il tuo Mentor.</p>
                            <p className="text-gray-400">Dimmi su cosa stai lavorando.</p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`mb-6 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xl px-5 py-3 rounded-2xl text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-[#3B5BDB] text-white'
                                    : 'bg-[#0f1229] border border-[#1e2340] text-gray-200'
                            }`}>
                                {msg.content.split('\n\n').map((para, i) => (
                                    <p key={i} className={i > 0 ? 'mt-3' : ''}>{para}</p>
                                ))}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex justify-start mb-6">
                            <div className="bg-[#0f1229] border border-[#1e2340] rounded-2xl px-5 py-3 text-gray-400 text-sm">
                                Il mentor sta pensando...
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                <div className="border-t border-[#1e2340] px-8 py-4 max-w-3xl mx-auto w-full">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            placeholder="Scrivi al tuo mentor..."
                            className="flex-1 bg-[#0f1229] border border-[#1e2340] text-white rounded-xl px-4 py-3 outline-none focus:border-[#3B5BDB] text-sm"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={loading || !input.trim() || !currentChatId}
                            className="bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-medium hover:bg-[#5C7CFA] transition-colors disabled:opacity-40"
                        >
                            →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
