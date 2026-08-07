'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface SocialConnection {
  id: string
  platform: string
  account_handle?: string
  status: string
}

interface DateItem {
  date: string
  title: string
  why_relevant: string
  suggestion: string
}

interface TrendItem {
  platform: string
  trend_title: string
  description: string
  how_to_use: string
}

type Tab = 'account' | 'componi' | 'calendario'

export default function SocialHubPage() {
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<Tab>('account')

  // Account tab
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([])
  const [socialConnecting, setSocialConnecting] = useState<string | null>(null)
  const [socialDisconnecting, setSocialDisconnecting] = useState<string | null>(null)
  const [socialConnectMsg, setSocialConnectMsg] = useState<string | null>(null)
  const [socialSuccessMsg, setSocialSuccessMsg] = useState<string | null>(null)

  // Calendario & Trend tab
  const [dates, setDates] = useState<DateItem[]>([])
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsLoaded, setInsightsLoaded] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/auth/login'); return }
      setUser(data.user)
      const { data: conns } = await supabase
        .from('social_connections')
        .select('id, platform, account_handle, status')
        .eq('user_id', data.user.id)
      if (conns) setSocialConnections(conns)
    })
  }, [])

  // Handle OAuth callback redirect params (social_connected / social_error)
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

  const loadInsights = async () => {
    if (insightsLoaded) return
    setLoadingInsights(true)
    setInsightsError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const headers = { Authorization: `Bearer ${token}` }

      const [datesRes, trendsRes] = await Promise.all([
        fetch('/api/social/insights?kind=dates', { headers }),
        fetch('/api/social/insights?kind=trends', { headers }),
      ])

      if (datesRes.ok) {
        const d = await datesRes.json()
        setDates(d.items ?? [])
      }
      if (trendsRes.ok) {
        const t = await trendsRes.json()
        setTrends(t.items ?? [])
      }
      if (!datesRes.ok && !trendsRes.ok) {
        setInsightsError('Impossibile caricare le informazioni. Riprova più tardi.')
      }
    } catch {
      setInsightsError('Impossibile caricare le informazioni. Riprova più tardi.')
    } finally {
      setLoadingInsights(false)
      setInsightsLoaded(true)
    }
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'calendario') loadInsights()
  }

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

  if (!user) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'componi', label: 'Componi' },
    { key: 'calendario', label: 'Calendario & Trend' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0c1a] text-white">
      <nav className="border-b border-[#1e2340] px-8 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Dashboard
        </Link>
        <span className="text-sm font-semibold text-gray-300">Social Media Manager</span>
        <div className="w-24" />
      </nav>

      {/* Tab bar */}
      <div className="border-b border-[#1e2340] px-6">
        <div className="max-w-3xl mx-auto flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#3B5BDB] text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-6 py-8 max-w-3xl mx-auto w-full">

        {/* ── Account tab ── */}
        {activeTab === 'account' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Account connessi</h2>

            {socialConnections.length === 0 ? (
              <p className="text-sm text-gray-500 mb-6">Nessun account connesso. Collega i tuoi profili social per iniziare.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-6">
                {socialConnections.map(conn => (
                  <div key={conn.id} className="flex items-center justify-between bg-[#0f1229] border border-[#1e2340] rounded-xl px-4 py-3">
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
              {socialSuccessMsg && <p className="mb-3 text-sm text-green-400">{socialSuccessMsg}</p>}
              {socialConnectMsg && <p className="mb-3 text-sm text-red-400">{socialConnectMsg}</p>}
              <div className="flex flex-wrap gap-2">
                {(['Instagram', 'TikTok', 'YouTube'] as const).map(platform => {
                  const isConnecting = socialConnecting === platform
                  return (
                    <button
                      key={platform}
                      onClick={() => handleSocialConnect(platform)}
                      disabled={socialConnecting !== null}
                      className="bg-[#0f1229] border border-[#1e2340] rounded-xl px-4 py-2 text-sm text-gray-300 hover:border-[#534AB7] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConnecting ? `Connessione ${platform}…` : `+ ${platform}`}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Componi tab ── */}
        {activeTab === 'componi' && (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-gray-400">Crea un post con l&apos;aiuto di Sloan e pubblicalo o programmalo sui tuoi account connessi.</p>
            {socialConnections.filter(c => c.status === 'connected').length === 0 && (
              <p className="text-sm text-yellow-400">Connetti almeno un account dalla tab Account prima di comporre un post.</p>
            )}
            <Link
              href="/social/compose"
              className="bg-[#3B5BDB] text-white rounded-xl px-6 py-3 font-semibold hover:bg-[#5C7CFA] transition-colors"
            >
              Apri il composer →
            </Link>
          </div>
        )}

        {/* ── Calendario & Trend tab ── */}
        {activeTab === 'calendario' && (
          <div className="flex flex-col gap-10">
            {insightsError && <p className="text-sm text-red-400">{insightsError}</p>}

            {/* Date da non perdere */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Date da non perdere</h2>
              {loadingInsights ? (
                <p className="text-sm text-gray-500">Generazione in corso, può richiedere qualche secondo…</p>
              ) : dates.length === 0 && insightsLoaded ? (
                <p className="text-sm text-gray-500">Nessuna data disponibile per il tuo settore.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {dates.map((item, i) => (
                    <div key={i} className="bg-[#0f1229] border border-[#1e2340] rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-semibold text-[#7F77DD] bg-[#1e1a40] px-2 py-1 rounded whitespace-nowrap mt-0.5">{item.date}</span>
                        <div>
                          <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
                          <p className="text-xs text-gray-400 mb-2">{item.why_relevant}</p>
                          <p className="text-xs text-[#7F77DD]">{item.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trend del momento */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Trend del momento</h2>
              {loadingInsights ? (
                <p className="text-sm text-gray-500">Generazione in corso, può richiedere qualche secondo…</p>
              ) : trends.length === 0 && insightsLoaded ? (
                <p className="text-sm text-gray-500">Nessun trend disponibile per il tuo settore.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {trends.map((item, i) => (
                    <div key={i} className="bg-[#0f1229] border border-[#1e2340] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-[#534AB7] bg-[#1e1a40] px-2 py-0.5 rounded capitalize">{item.platform}</span>
                        <p className="text-sm font-semibold text-white">{item.trend_title}</p>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">{item.description}</p>
                      <p className="text-xs text-[#7F77DD]">{item.how_to_use}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
