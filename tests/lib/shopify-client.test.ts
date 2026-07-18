// tests/lib/shopify-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'

describe('shopifyQuery', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test-shop.myshopify.com'
    process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('posts the query with the access token header and returns data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { shop: { name: 'Sparkly Tails' } } }),
    }) as unknown as typeof fetch

    const result = await shopifyQuery<{ shop: { name: string } }>(
      'query { shop { name } }',
    )

    expect(result.shop.name).toBe('Sparkly Tails')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test-shop.myshopify.com/admin/api/2025-10/graphql.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Shopify-Access-Token': 'shpat_test_token',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('throws when Shopify returns errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ errors: [{ message: 'Field does not exist' }] }),
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { bogus }')).rejects.toThrow('Field does not exist')
  })

  it('throws a diagnosable error when the response body is not valid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0')
      },
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { shop { name } }')).rejects.toThrow(/HTTP 502/)
  })

  it('throws a diagnosable error for a non-2xx response with a JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ message: 'Exceeded rate limit' }),
    }) as unknown as typeof fetch

    await expect(shopifyQuery('query { shop { name } }')).rejects.toThrow(/HTTP 429/)
  })
})
