'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface SocialConnection {
  id: string
  platform: string
  account_handle?: string
}

export default function ComposePage() {
  const [user, setUser] = useState<any>(null)
  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [brief, setBrief] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [generating, setGenerating] = useState(false)
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/auth/login'); return }
      setUser(data.user)
      const { data: conns } = await supabase
        .from('social_connections')
        .select('id, platform, account_handle')
        .eq('user_id', data.user.id)
        .eq('status', 'connected')
      if (conns) setConnections(conns)
    })
  }, [])

  const toggleConnection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    if (!selectedIds.length || !brief.trim()) return
    setGenerating(true)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const selectedPlatforms = connections
        .filter(c => selectedIds.includes(c.id))
        .map(c => c.platform)
      const res = await fetch('/api/social/generate-copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ platforms: selectedPlatforms, brief: brief.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setGeneratedContent(data.content)
      } else {
        setErrorMsg('Generazione non riuscita. Riprova.')
      }
    } catch {
      setErrorMsg('Generazione non riuscita. Riprova.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish = async () => {
    if (!selectedIds.length || !generatedContent.trim()) return
    if (publishMode === 'schedule' && !scheduledFor) {
      setErrorMsg('Seleziona una data e ora per la programmazione.')
      return
    }
    setPublishing(true)
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = {
        connectionIds: selectedIds,
        content: generatedContent.trim(),
      }
      if (publishMode === 'schedule') {
        body.scheduledFor = new Date(scheduledFor).toISOString()
        body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccessMsg(publishMode === 'schedule' ? 'Post programmato con successo!' : 'Post pubblicato con successo!')
        setGeneratedContent('')
        setBrief('')
        setSelectedIds([])
        setScheduledFor('')
      } else {
        setErrorMsg(data.error ?? 'Pubblicazione non riuscita. Riprova.')
      }
    } catch {
      setErrorMsg('Pubblicazione non riuscita. Riprova.')
    } finally {
      setPublishing(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0a0c1a] text-white">
      <nav className="border-b border-[#1e2340] px-8 py-4">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Torna alla Dashboard
        </Link>
      </nav>

      <main className="px-6 py-10 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-8">Componi un post</h1>

        {/* Account selection */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Pubblica su</p>
          {connections.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nessun account connesso.{' '}
              <Link href="/dashboard" className="text-[#7F77DD] hover:underline">
                Connetti un account
              </Link>{' '}
              dalla dashboard.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {connections.map(conn => {
                const selected = selectedIds.includes(conn.id)
                return (
                  <button
                    key={conn.id}
                    onClick={() => toggleConnection(conn.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-[#3B5BDB] border-[#3B5BDB] text-white'
                        : 'bg-[#0f1229] border-[#1e2340] text-gray-300 hover:border-[#534AB7]'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-xs font-bold ${selected ? 'bg-white border-white text-[#3B5BDB]' : 'border-gray-500 text-transparent'}`}>
                      ✓
                    </span>
                    <span className="capitalize">{conn.platform}</span>
                    {conn.account_handle && (
                      <span className="text-xs opacity-70">@{conn.account_handle}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Brief */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Di cosa vuoi parlare?
          </label>
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="Es. Abbiamo appena lanciato la nostra beta — voglio ringraziare i primi utenti e invitare chi non si è ancora iscritto a provarlo..."
            rows={3}
            className="w-full bg-[#0f1229] border border-[#1e2340] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B5BDB] resize-none"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !selectedIds.length || !brief.trim()}
          className="mb-8 bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-semibold hover:bg-[#5C7CFA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? 'Generazione in corso…' : 'Genera con Sloan'}
        </button>

        {!generatedContent && errorMsg && (
          <p className="mb-4 text-sm text-red-400">{errorMsg}</p>
        )}

        {/* Generated content + publish section */}
        {generatedContent && (
          <div className="bg-[#0f1229] border border-[#1e2340] rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Testo del post
            </label>
            <textarea
              value={generatedContent}
              onChange={e => setGeneratedContent(e.target.value)}
              rows={6}
              className="w-full bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3B5BDB] resize-none mb-5"
            />

            {/* Publish mode toggle */}
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Quando pubblicare</p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setPublishMode('now')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  publishMode === 'now'
                    ? 'bg-[#1e2340] border-[#534AB7] text-white'
                    : 'bg-transparent border-[#1e2340] text-gray-400 hover:border-[#534AB7]'
                }`}
              >
                Pubblica subito
              </button>
              <button
                onClick={() => setPublishMode('schedule')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  publishMode === 'schedule'
                    ? 'bg-[#1e2340] border-[#534AB7] text-white'
                    : 'bg-transparent border-[#1e2340] text-gray-400 hover:border-[#534AB7]'
                }`}
              >
                Programma
              </button>
            </div>

            {publishMode === 'schedule' && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={e => setScheduledFor(e.target.value)}
                className="mb-5 w-full bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3B5BDB] [color-scheme:dark]"
              />
            )}

            {successMsg && <p className="mb-3 text-sm text-green-400">{successMsg}</p>}
            {errorMsg && <p className="mb-3 text-sm text-red-400">{errorMsg}</p>}

            <button
              onClick={handlePublish}
              disabled={publishing || !generatedContent.trim() || !selectedIds.length}
              className="bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-semibold hover:bg-[#5C7CFA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishing
                ? 'Pubblicazione in corso…'
                : publishMode === 'schedule'
                  ? 'Programma post'
                  : 'Pubblica'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
