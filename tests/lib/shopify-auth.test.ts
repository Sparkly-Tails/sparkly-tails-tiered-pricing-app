import { describe, it, expect } from 'vitest'
import { verifyShopifyHmac, makeSessionToken, verifyUrlToken } from '@/lib/shopify-auth'

describe('verifyShopifyHmac', () => {
  it('rejects a request with no hmac param', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com' })
    expect(await verifyShopifyHmac(params, 'secret')).toBe(false)
  })

  it('rejects an invalid hmac', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com', hmac: 'wrong' })
    expect(await verifyShopifyHmac(params, 'secret')).toBe(false)
  })
})

describe('makeSessionToken / verifyUrlToken', () => {
  it('accepts a freshly minted token', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'secret')
    expect(await verifyUrlToken(token, 'secret')).toBe(true)
  })

  it('rejects a token signed with the wrong secret', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'secret-a')
    expect(await verifyUrlToken(token, 'secret-b')).toBe(false)
  })

  it('rejects a malformed token', async () => {
    expect(await verifyUrlToken('not-a-real-token', 'secret')).toBe(false)
  })

  it('rejects a token older than the 10-minute window', async () => {
    // Construct an expired token directly: shop|timestamp-11-minutes-ago|validSig
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000
    const shop = 'test.myshopify.com'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${shop}|${elevenMinutesAgo}`))
    const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const expiredToken = `${shop}|${elevenMinutesAgo}|${sigHex}`
    expect(await verifyUrlToken(expiredToken, 'secret')).toBe(false)
  })
})
