'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Chat {
  id: string
  title: string
  created_at: string
}

interface Profile {
  stage?: string
  what_building?: string
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recentChats, setRecentChats] = useState<Chat[]>([])
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
        supabase.from('founder_profiles').select('stage, what_building').eq('user_id', u.id).single(),
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
    })
  }, [])

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
            width={120}
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
              Stai lavorando su: <span className="text-gray-300">{profile.what_building || profile.stage}</span>
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

      </main>
    </div>
  )
}
