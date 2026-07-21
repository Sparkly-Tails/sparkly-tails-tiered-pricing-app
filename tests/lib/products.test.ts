import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProductInfo, getProductInfoBatch, searchProducts } from '@/lib/products'
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

describe('getProductInfoBatch', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fetches multiple products in a single query and keys results by id', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/111',
          title: 'Chicken Voucher',
          variants: { edges: [{ node: { price: '1.70' } }] },
        },
        {
          id: 'gid://shopify/Product/222',
          title: 'Beef Voucher',
          variants: { edges: [{ node: { price: '2.50' } }] },
        },
      ],
    })

    const result = await getProductInfoBatch([
      'gid://shopify/Product/111',
      'gid://shopify/Product/222',
    ])

    expect(result.get('gid://shopify/Product/111')).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
    expect(result.get('gid://shopify/Product/222')).toEqual({ title: 'Beef Voucher', basePrice: 2.50 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('nodes(ids: $ids)'),
      { ids: ['gid://shopify/Product/111', 'gid://shopify/Product/222'] },
    )
  })

  it('maps a deleted or non-Product node to null rather than omitting it', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/111',
          title: 'Chicken Voucher',
          variants: { edges: [{ node: { price: '1.70' } }] },
        },
        null,
      ],
    })

    const result = await getProductInfoBatch([
      'gid://shopify/Product/111',
      'gid://shopify/Product/999',
    ])

    expect(result.get('gid://shopify/Product/111')).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
    expect(result.get('gid://shopify/Product/999')).toBeNull()
    expect(result.has('gid://shopify/Product/999')).toBe(true)
  })

  it('returns an empty map without calling shopifyQuery for an empty id list', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')

    const result = await getProductInfoBatch([])

    expect(result.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('searchProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns matching products with real ids', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      products: {
        edges: [
          { node: { id: 'gid://shopify/Product/111', title: 'Chicken Voucher' } },
          { node: { id: 'gid://shopify/Product/222', title: 'Chicken Treats' } },
        ],
      },
    })

    const result = await searchProducts('chicken')
    expect(result).toEqual([
      { id: 'gid://shopify/Product/111', title: 'Chicken Voucher' },
      { id: 'gid://shopify/Product/222', title: 'Chicken Treats' },
    ])
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('products(first: 8'), { q: 'chicken' })
  })

  it('returns an empty array without calling shopifyQuery for a blank query', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')

    const result = await searchProducts('   ')

    expect(result).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
