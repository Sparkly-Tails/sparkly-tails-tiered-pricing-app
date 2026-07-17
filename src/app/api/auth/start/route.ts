import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

// This route has exactly one job: redirect to Shopify OAuth. No
// session/skip-OAuth logic belongs here — that lives in proxy.ts.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')

  if (!shop) return new NextResponse('Missing shop', { status: 400 })

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) {
    return new NextResponse('Invalid HMAC', { status: 403 })
  }

  const callbackUrl = new URL('/api/auth/callback', req.url).toString()
  const scopes = 'write_discounts,read_discounts,write_products,read_products'

  const oauthUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  oauthUrl.searchParams.set('client_id', apiKey)
  oauthUrl.searchParams.set('scope', scopes)
  oauthUrl.searchParams.set('redirect_uri', callbackUrl)

  return NextResponse.redirect(oauthUrl.toString())
}
