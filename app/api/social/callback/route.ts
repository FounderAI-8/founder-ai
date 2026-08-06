import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkzgisgrbipbnaogeryw.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ZERNIO_API = 'https://zernio.com/api/v1'
const ZERNIO_KEY = process.env.ZERNIO_API_KEY!

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: 'return=representation',
}

const zHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ZERNIO_KEY}`,
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const profileId = params.get('profileId')
  const tempToken = params.get('tempToken')
  // Real Zernio callback uses 'connected' for the platform name (observed in production logs);
  // 'platform' is what the official docs describe — keep as fallback in case it changes again.
  const platform = params.get('connected') ?? params.get('platform') ?? 'unknown'
  const step = params.get('step')
  const userProfileRaw = params.get('userProfile')

  const dashboardUrl = new URL('/dashboard', req.nextUrl.origin)

  if (!profileId) {
    dashboardUrl.searchParams.set('social_error', 'missing_profile')
    return NextResponse.redirect(dashboardUrl)
  }

  // Resolve user_id from zernio_profile_id stored in founder_profiles
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/founder_profiles?zernio_profile_id=eq.${profileId}&select=user_id`,
    { headers: sbHeaders }
  )
  const profiles = await profileRes.json()
  const userId: string | undefined = profiles?.[0]?.user_id

  if (!userId) {
    dashboardUrl.searchParams.set('social_error', 'user_not_found')
    return NextResponse.redirect(dashboardUrl)
  }

  let aggregatorAccountId: string | null = null
  let accountHandle: string | null = null

  if (step === 'select_page' && tempToken) {
    // Some platforms (Facebook, and potentially Instagram) require selecting a page/profile.
    // We auto-select the first available page so the backend completes the flow without a UI.
    const listRes = await fetch(
      `${ZERNIO_API}/connect/${platform}/select-page?profileId=${profileId}&tempToken=${tempToken}`,
      { headers: zHeaders }
    )

    if (listRes.ok) {
      const listData = await listRes.json()
      const pages: Array<{ id?: string; pageId?: string; name?: string; username?: string }> =
        listData.pages ?? listData.accounts ?? []
      const first = pages[0]

      if (first) {
        const pageId = first.id ?? first.pageId

        let userProfile: unknown
        if (userProfileRaw) {
          try {
            userProfile = JSON.parse(decodeURIComponent(userProfileRaw))
          } catch {
            // ignore malformed userProfile
          }
        }

        const selectRes = await fetch(`${ZERNIO_API}/connect/${platform}/select-page`, {
          method: 'POST',
          headers: zHeaders,
          body: JSON.stringify({
            profileId,
            pageId,
            tempToken,
            ...(userProfile !== undefined ? { userProfile } : {}),
          }),
        })

        if (selectRes.ok) {
          const selectData = await selectRes.json()
          aggregatorAccountId =
            selectData.account?.accountId ?? selectData.account?._id ?? null
          accountHandle =
            selectData.account?.name ?? selectData.account?.username ?? first.name ?? null
        }
      }
    }
  } else {
    // Direct OAuth platforms (TikTok, YouTube, Twitter, etc.): connection is complete.
    // Zernio redirects back immediately after Google/TikTok OAuth, but its backend may not have
    // persisted the new account yet — wait briefly before querying /accounts.
    await new Promise(resolve => setTimeout(resolve, 1500))

    const accountsRes = await fetch(
      `${ZERNIO_API}/accounts?profileId=${profileId}`,
      { headers: zHeaders }
    )

    if (!accountsRes.ok) {
      console.error(
        `[social/callback] /accounts failed: status=${accountsRes.status} platform=${platform} profileId=${profileId} body=${await accountsRes.text()}`
      )
    } else {
      const accountsData = await accountsRes.json()
      const accounts: Array<{
        _id: string
        platform: string
        username?: string
        handle?: string
        name?: string
      }> = accountsData.accounts ?? []

      // Prefer an exact platform match; fall back to the most recent (last) account
      const match =
        accounts.find(a => a.platform === platform) ?? accounts[accounts.length - 1]

      if (!match) {
        console.error(
          `[social/callback] no account match: platform=${platform} profileId=${profileId} accounts=${JSON.stringify(accounts)}`
        )
      } else {
        aggregatorAccountId = match._id
        accountHandle = match.username ?? match.handle ?? match.name ?? null
      }
    }
  }

  // If we couldn't retrieve an accountId, the connection failed silently — signal the error
  if (!aggregatorAccountId) {
    dashboardUrl.searchParams.set('social_error', 'connection_failed')
    return NextResponse.redirect(dashboardUrl)
  }

  // Upsert into social_connections — unique constraint on (user_id, platform) handles deduplication
  await fetch(`${SUPABASE_URL}/rest/v1/social_connections`, {
    method: 'POST',
    headers: {
      ...sbHeaders,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      platform,
      account_handle: accountHandle,
      aggregator_account_id: aggregatorAccountId,
      status: 'connected',
      connected_at: new Date().toISOString(),
    }),
  })

  dashboardUrl.searchParams.set('social_connected', platform)
  return NextResponse.redirect(dashboardUrl)
}
