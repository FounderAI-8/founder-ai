'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  CHECKLIST_BY_TRACK,
  NEXT_STEPS_BY_TRACK_STAGE,
  DEFAULT_CHECKLIST,
  DEFAULT_NEXT_STEPS,
} from '@/lib/dashboard-content'

interface Chat {
  id: string
  title: string
  created_at: string
}

interface Profile {
  stage?: string
  idea?: string
  track?: string
  problem?: string
  plan?: string
}

interface SocialConnection {
  id: string
  platform: string
  account_handle?: string
  status: string
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recentChats, setRecentChats] = useState<Chat[]>([])
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([])
  const [socialConnecting, setSocialConnecting] = useState<string | null>(null)
  const [socialDisconnecting, setSocialDisconnecting] = useState<string | null>(null)
  const [socialConnectMsg, setSocialConnectMsg] = useState<string | null>(null)
  const [socialSuccessMsg, setSocialSuccessMsg] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/auth/login')
        return
      }
      const u = data.user
      setUser(u)

      const [profileRes, chatsRes] = await Promise.all([
        supabase.from('founder_profiles').select('stage, idea, track, problem, plan').eq('user_id', u.id).single(),
        fetch(`/api/chats?userId=${u.id}`)
      ])

      if (!profileRes.data) {
        router.push('/onboarding')
        return
      }
      setProfile(profileRes.data)

      if (chatsRes.ok) {
        const chats: Chat[] = await chatsRes.json()
        if (Array.isArray(chats)) setRecentChats(chats.slice(0, 3))
      }

      if (profileRes.data?.plan === 'pro') {
        const { data: connections } = await supabase
          .from('social_connections')
          .select('id, platform, account_handle, status')
          .eq('user_id', u.id)
        if (connections) setSocialConnections(connections)
      }
    })
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('social_connected')
    const error = params.get('social_error')
    if (connected || error) {
      window.history.replaceState(null, '', window.location.pathname)
      if (connected) setSocialSuccessMsg(`Account ${connected} connesso con successo!`)
      if (error) setSocialConnectMsg('Connessione non riuscita. Riprova o contatta il supporto.')
    }
  }, [])

  const handleSocialDisconnect = async (connectionId: string, platform: string) => {
    if (!window.confirm(`Vuoi davvero disconnettere l'account ${platform}?`)) return
    setSocialDisconnecting(connectionId)
    setSocialConnectMsg(null)
    setSocialSuccessMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/social/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ connectionId }),
      })
      if (res.ok) {
        setSocialConnections(prev => prev.filter(c => c.id !== connectionId))
        setSocialSuccessMsg(`Account ${platform} disconnesso.`)
      } else {
        setSocialConnectMsg('Disconnessione non riuscita. Riprova.')
      }
    } catch {
      setSocialConnectMsg('Disconnessione non riuscita. Riprova.')
    } finally {
      setSocialDisconnecting(null)
    }
  }

  const handleSocialConnect = async (platform: string) => {
    setSocialConnecting(platform)
    setSocialConnectMsg(null)
    try {
      const res = await fetch('/api/social/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platform.toLowerCase(), userId: user.id }),
      })
      const data = await res.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        setSocialConnectMsg('Impossibile avviare la connessione. Riprova.')
        setSocialConnecting(null)
      }
    } catch {
      setSocialConnectMsg('Impossibile avviare la connessione. Riprova.')
      setSocialConnecting(null)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const displayName = user?.email?.split('@')[0] ?? ''

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0a0c1a] text-white">
      <nav className="border-b border-[#1e2340] px-8 py-4 flex justify-between items-center">
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
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Esci
          </button>
        </div>
      </nav>

      <main className="px-6 py-10 max-w-3xl mx-auto w-full">

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">Bentornato, {displayName}.</h1>
          {profile?.stage && (
            <p className="text-gray-400 text-sm">
              Stai lavorando su: <span className="text-gray-300">{profile.idea || profile.stage}</span>
            </p>
          )}
        </div>

        <div className="bg-[#0f1229] border border-[#3B5BDB] rounded-2xl p-6 mb-8">
          <p className="text-sm text-[#7F77DD] font-medium mb-1">Il tuo mentor è pronto</p>
          <h2 className="text-xl font-bold mb-4">Nuova conversazione con Sloan</h2>
          <button
            onClick={() => router.push('/mentor')}
            className="bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-semibold hover:bg-[#5C7CFA] transition-colors"
          >
            Inizia sessione →
          </button>
        </div>

        {recentChats.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Ultime conversazioni</h2>
            <div className="flex flex-col gap-2">
              {recentChats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => router.push('/mentor')}
                  className="bg-[#0f1229] border border-[#1e2340] rounded-xl px-5 py-4 text-left hover:border-[#3B5BDB] transition-colors group"
                >
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate block">
                    {chat.title}
                  </span>
                  <span className="text-xs text-gray-600 mt-1 block">
                    {new Date(chat.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#0f1229] border border-[#1e2340] rounded-xl p-5">
            <p className="text-gray-400 text-xs mb-1">Sessioni mentor</p>
            <p className="text-2xl font-bold">{recentChats.length}</p>
          </div>
          <div className="bg-[#0f1229] border border-[#1e2340] rounded-xl p-5">
            <p className="text-gray-400 text-xs mb-1">Stage attuale</p>
            <p className="text-sm font-semibold mt-1 text-[#7F77DD]">{profile?.stage ?? '—'}</p>
          </div>
          <div className="bg-[#0f1229] border border-[#1e2340] rounded-xl p-5 col-span-2 sm:col-span-1">
            <p className="text-gray-400 text-xs mb-1">Errori evitati</p>
            <p className="text-2xl font-bold">0</p>
          </div>
        </div>

        {/* ── Prossimi passi consigliati ── */}
        {(() => {
          const steps = (profile?.track && profile?.stage)
            ? (NEXT_STEPS_BY_TRACK_STAGE[profile.track]?.[profile.stage] ?? DEFAULT_NEXT_STEPS)
            : DEFAULT_NEXT_STEPS
          return (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Prossimi passi consigliati</h2>
              <div className="bg-[#0f1229] border border-[#1e2340] rounded-2xl p-6 flex flex-col gap-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1e2340] text-[#7F77DD] text-xs flex items-center justify-center font-semibold mt-0.5">{i + 1}</span>
                    <p className="text-sm text-gray-300 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Cosa monitorare ── */}
        {(() => {
          const checklist = profile?.track
            ? (CHECKLIST_BY_TRACK[profile.track] ?? DEFAULT_CHECKLIST)
            : DEFAULT_CHECKLIST
          return (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{checklist.title}</h2>
              <div className="bg-[#0f1229] border border-[#1e2340] rounded-2xl p-6 flex flex-col gap-2">
                {checklist.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-4 h-4 rounded border border-[#534AB7] mt-0.5" />
                    <p className="text-sm text-gray-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Chiedi a Sloan ── */}
        {(() => {
          const q1 = profile?.problem
            ? `Aiutami a capire se questo è davvero la priorità numero uno adesso: ${profile.problem}`
            : "Qual è la cosa più importante su cui concentrarmi in questo momento?"
          const q2 = profile?.track === 'smb'
            ? "Come dovrei gestire la cassa in questa fase del mio business?"
            : "Quali metriche dovrei guardare con più attenzione in questa fase?"
          const q3 = "Qual è il prossimo passo concreto per me questa settimana?"
          return (
            <div className="mt-8 mb-2">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Chiedi a Sloan</h2>
              <div className="flex flex-col gap-3">
                {[q1, q2, q3].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => router.push(`/mentor?prefill=${encodeURIComponent(q)}`)}
                    className="bg-[#0f1229] border border-[#1e2340] rounded-xl px-5 py-4 text-left hover:border-[#534AB7] hover:bg-[#0f1229] transition-colors group"
                  >
                    <p className="text-sm text-gray-300 group-hover:text-white transition-colors leading-relaxed">{q}</p>
                    <p className="text-xs text-[#534AB7] mt-2 font-medium">Chiedi →</p>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Social Media Manager ── */}
        <div className="mt-8 mb-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Social Media Manager</h2>

          {profile?.plan !== 'pro' ? (
            <div className="bg-[#0f1229] border border-[#1e2340] rounded-2xl p-6 opacity-80">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#534AB7] bg-[#1e1a40] px-2 py-1 rounded">Pro</span>
                <p className="text-sm font-semibold text-gray-300">Social Media Manager — Disponibile con il piano Pro</p>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Crea e pubblica contenuti social con l&apos;aiuto di Sloan, resta aggiornato sui trend del tuo settore e gestisci tutti i tuoi account da un unico posto.
              </p>
            </div>
          ) : (
            <div className="bg-[#0f1229] border border-[#3B5BDB] rounded-2xl p-6">
              <p className="text-sm text-[#7F77DD] font-medium mb-4">Account connessi</p>

              {socialConnections.length === 0 ? (
                <p className="text-sm text-gray-500 mb-5">Nessun account connesso. Collega i tuoi profili social per iniziare.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-5">
                  {socialConnections.map(conn => (
                    <div key={conn.id} className="flex items-center justify-between bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-white capitalize">{conn.platform}</span>
                        {conn.account_handle && (
                          <span className="text-xs text-gray-500 ml-2">@{conn.account_handle}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${conn.status === 'connected' ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'}`}>
                          {conn.status}
                        </span>
                        <button
                          onClick={() => handleSocialDisconnect(conn.id, conn.platform)}
                          disabled={socialDisconnecting === conn.id}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {socialDisconnecting === conn.id ? 'Disconnessione…' : 'Disconnetti'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Connetti un account</p>
                {socialSuccessMsg && (
                  <p className="mb-3 text-sm text-green-400">{socialSuccessMsg}</p>
                )}
                {socialConnectMsg && (
                  <p className="mb-3 text-sm text-red-400">{socialConnectMsg}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(['Instagram', 'TikTok', 'YouTube'] as const).map(platform => {
                    const isConnecting = socialConnecting === platform
                    return (
                      <button
                        key={platform}
                        onClick={() => handleSocialConnect(platform)}
                        disabled={socialConnecting !== null}
                        className="bg-[#0a0c1a] border border-[#1e2340] rounded-xl px-4 py-2 text-sm text-gray-300 hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isConnecting ? `Connessione ${platform}…` : `+ ${platform}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
