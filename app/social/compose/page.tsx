'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const DesignEditor = dynamic(() => import('./DesignEditor'), { ssr: false })

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
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imageCorrection, setImageCorrection] = useState('')
  const [correctionHistory, setCorrectionHistory] = useState<string[]>([])
  const [imageDescription, setImageDescription] = useState('')
  const [suggestingDescription, setSuggestingDescription] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [imageSource, setImageSource] = useState<'ai' | 'upload'>('ai')
  const [imageUploading, setImageUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
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

  const handleGenerateImage = async () => {
    setImageGenerating(true)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ description: imageDescription, brief: brief.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setImageUrl(data.imageUrl)
        setImageSource('ai')
        setCorrectionHistory([])
      } else {
        setErrorMsg('Generazione immagine non riuscita. Riprova.')
      }
    } catch {
      setErrorMsg('Generazione immagine non riuscita. Riprova.')
    } finally {
      setImageGenerating(false)
    }
  }

  const handleUploadImage = () => {
    uploadInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg("Formato file non valido. Carica un'immagine (JPG, PNG, WebP, ecc.)")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File troppo grande. Dimensione massima: 10 MB.')
      return
    }
    setImageUploading(true)
    setErrorMsg(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Errore lettura file'))
        reader.readAsDataURL(file)
      })
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/composite-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ imageBase64: dataUrl }),
      })
      const data = await res.json()
      if (res.ok) {
        setImageUrl(data.imageUrl)
        setImageSource('upload')
        setCorrectionHistory([])
      } else {
        setErrorMsg(data.error ?? 'Caricamento immagine non riuscito. Riprova.')
      }
    } catch {
      setErrorMsg('Caricamento immagine non riuscito. Riprova.')
    } finally {
      setImageUploading(false)
    }
  }

  const handleRegenerateImage = async () => {
    if (!imageCorrection.trim()) return
    setImageGenerating(true)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const newHistory = [...correctionHistory, imageCorrection.trim()]
      const corrections = newHistory.map((c, i) => `${i + 1}) ${c}`).join(' ')
      const base = imageDescription.trim() || `Immagine per il post riguardante: ${brief.trim()}`
      const description = `${base}. Modifiche richieste in ordine: ${corrections}`
      const res = await fetch('/api/social/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ description, brief: brief.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setImageUrl(data.imageUrl)
        setCorrectionHistory(newHistory)
        setImageCorrection('')
      } else {
        setErrorMsg('Generazione immagine non riuscita. Riprova.')
      }
    } catch {
      setErrorMsg('Generazione immagine non riuscita. Riprova.')
    } finally {
      setImageGenerating(false)
    }
  }

  const handleSuggestDescription = async () => {
    setSuggestingDescription(true)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/suggest-image-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ brief: brief.trim(), postText: generatedContent }),
      })
      const data = await res.json()
      if (res.ok) {
        setImageDescription(data.description)
      } else {
        setErrorMsg('Suggerimento non riuscito. Riprova.')
      }
    } catch {
      setErrorMsg('Suggerimento non riuscito. Riprova.')
    } finally {
      setSuggestingDescription(false)
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
      if (imageUrl) body.imageUrl = imageUrl
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
        setImageUrl(null)
        setCorrectionHistory([])
        setImageDescription('')
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
        <Link href="/social" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Torna al Social Manager
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

            {/* Image generation */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Immagine (consigliata — Instagram, TikTok e YouTube richiedono un media per pubblicare)</p>
              <p className="text-sm text-yellow-400 mb-3">L&apos;AI genera immagini di alta qualità ma non è affidabile nello scrivere testo al loro interno (errori di ortografia/battitura frequenti). Per i risultati migliori, genera l&apos;immagine senza chiedere scritte, e aggiungi eventuale testo con altri strumenti prima di pubblicare.</p>
              {imageUrl ? (
                <div>
                  <img src={imageUrl} alt="Immagine generata" className="w-full rounded-xl mb-3" />
                  {imageSource === 'ai' && (
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={imageCorrection}
                        onChange={e => setImageCorrection(e.target.value)}
                        placeholder='Es. "rendila più luminosa" o "aggiungi più persone"'
                        className="flex-1 bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B5BDB]"
                      />
                      <button
                        onClick={handleRegenerateImage}
                        disabled={imageGenerating || !imageCorrection.trim()}
                        className="bg-[#1e2340] border border-[#534AB7] text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {imageGenerating ? 'Generazione…' : 'Rigenera'}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setEditorOpen(true)}
                      className="bg-[#1e2340] border border-[#534AB7] text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-[#2a3060] transition-colors"
                    >
                      Modifica design
                    </button>
                    <button
                      onClick={() => { setImageUrl(null); setCorrectionHistory([]); setImageSource('ai') }}
                      className="text-sm text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Rimuovi immagine
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Descrizione immagine (opzionale)
                    </label>
                    <div className="flex gap-2 items-start">
                      <textarea
                        value={imageDescription}
                        onChange={e => setImageDescription(e.target.value)}
                        placeholder="Lascia vuoto per generazione automatica, oppure descrivi tu cosa vuoi vedere nell'immagine"
                        rows={2}
                        className="flex-1 bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B5BDB] resize-none"
                      />
                      <button
                        onClick={handleSuggestDescription}
                        disabled={suggestingDescription || !brief.trim()}
                        className="bg-[#1e2340] border border-[#534AB7] text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-[#2a3060] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {suggestingDescription ? 'Suggerimento…' : 'Suggerisci'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleGenerateImage}
                      disabled={imageGenerating || imageUploading}
                      className="bg-[#0f1229] border border-[#1e2340] text-gray-300 rounded-xl px-5 py-2 text-sm font-medium hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {imageGenerating ? 'Generazione immagine…' : 'Genera immagine'}
                    </button>
                    <button
                      onClick={handleUploadImage}
                      disabled={imageGenerating || imageUploading}
                      className="bg-[#0f1229] border border-[#1e2340] text-gray-300 rounded-xl px-5 py-2 text-sm font-medium hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {imageUploading ? 'Caricamento…' : 'Carica immagine'}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </div>

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

      {editorOpen && imageUrl && (
        <DesignEditor
          imageUrl={imageUrl}
          onSave={(newUrl) => {
            setImageUrl(newUrl)
            setCorrectionHistory([])
            setEditorOpen(false)
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  )
}
