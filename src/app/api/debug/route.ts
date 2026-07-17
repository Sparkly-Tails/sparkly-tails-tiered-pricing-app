import { NextResponse } from 'next/server'

export async function GET() {
  // Returns config presence/shop domain — real information disclosure if
  // left reachable in production. NODE_ENV !== 'development' means a 404,
  // not a 503 or an auth challenge, so it doesn't even confirm the route
  // exists. Vercel production deploys always run with NODE_ENV=production,
  // so this is closed automatically with no env var to remember to set.
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  return NextResponse.json({
    secretSet: !!process.env.SHOPIFY_API_SECRET_KEY,
    secretLength: process.env.SHOPIFY_API_SECRET_KEY?.length ?? 0,
    apiKeySet: !!process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    shopSet: !!process.env.SHOPIFY_SHOP,
    shop: process.env.SHOPIFY_SHOP ?? null,
    accessTokenSet: !!process.env.SHOPIFY_ACCESS_TOKEN,
  })
}
