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

export async function POST(req: NextRequest) {
  try {
    const { platform, userId } = await req.json()

    if (!platform || !userId) {
      return NextResponse.json({ error: 'Missing platform or userId' }, { status: 400 })
    }

    // Look up existing zernio_profile_id for this user
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/founder_profiles?user_id=eq.${userId}&select=zernio_profile_id`,
      { headers: sbHeaders }
    )
    const profiles = await profileRes.json()
    let zernioProfileId: string = profiles?.[0]?.zernio_profile_id ?? ''

    // Create a Zernio profile if one doesn't exist yet
    if (!zernioProfileId) {
      const createRes = await fetch(`${ZERNIO_API}/profiles`, {
        method: 'POST',
        headers: zHeaders,
        body: JSON.stringify({ name: userId }),
      })
      if (!createRes.ok) {
        const err = await createRes.text()
        console.error('Zernio create profile error:', err)
        return NextResponse.json({ error: 'Failed to create Zernio profile' }, { status: 502 })
      }
      const createData = await createRes.json()
      zernioProfileId = createData.profile._id

      await fetch(
        `${SUPABASE_URL}/rest/v1/founder_profiles?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ zernio_profile_id: zernioProfileId }),
        }
      )
    }

    const redirectUrl = `${req.nextUrl.origin}/api/social/callback`
    const connectRes = await fetch(
      `${ZERNIO_API}/connect/${platform}?profileId=${zernioProfileId}&headless=true&redirect_url=${encodeURIComponent(redirectUrl)}`,
      { headers: zHeaders }
    )

    if (!connectRes.ok) {
      const err = await connectRes.text()
      console.error('Zernio connect error:', err)
      return NextResponse.json({ error: 'Failed to get auth URL from Zernio' }, { status: 502 })
    }

    const connectData = await connectRes.json()
    return NextResponse.json({ authUrl: connectData.authUrl })
  } catch (err) {
    console.error('Social connect error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
