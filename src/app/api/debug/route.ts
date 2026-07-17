import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    secretSet: !!process.env.SHOPIFY_API_SECRET_KEY,
    secretLength: process.env.SHOPIFY_API_SECRET_KEY?.length ?? 0,
    apiKeySet: !!process.env.NEXT_PUBLIC_SHOPIFY_API_KEY,
    shopSet: !!process.env.SHOPIFY_SHOP,
    shop: process.env.SHOPIFY_SHOP ?? null,
    accessTokenSet: !!process.env.SHOPIFY_ACCESS_TOKEN,
  })
}
