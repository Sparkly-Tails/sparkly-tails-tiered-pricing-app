import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProductInfo } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('getProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title and base price parsed from the first variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        title: 'Chicken Voucher',
        variants: { edges: [{ node: { price: '1.70' } }] },
      },
    })

    const result = await getProductInfo('gid://shopify/Product/111')
    expect(result).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
  })

  it('returns null when the product does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })

    const result = await getProductInfo('gid://shopify/Product/999')
    expect(result).toBeNull()
  })

  it('returns null when the product has no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: { title: 'Empty Product', variants: { edges: [] } },
    })

    const result = await getProductInfo('gid://shopify/Product/222')
    expect(result).toBeNull()
  })
})
