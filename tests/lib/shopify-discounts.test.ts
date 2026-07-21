import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listActualDiscounts, applyActions } from '@/lib/shopify-discounts'
import * as shopifyClient from '@/lib/shopify-client'
import type { Action } from '@/lib/reconciler'

describe('listActualDiscounts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses discounts with the "Tiers: " title prefix into ActualDiscount shape', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/aaa',
              automaticDiscount: {
                title: 'Tiers: Standard voucher — gid://shopify/Product/111 — 5+',
                minimumRequirement: { greaterThanOrEqualToQuantity: '5' },
                customerGets: {
                  value: { percentage: 0.147 },
                  items: { productsToAdd: { edges: [{ node: { id: 'gid://shopify/Product/111' } }] } },
                },
              },
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([
      {
        id: 'gid://shopify/DiscountAutomaticNode/aaa',
        productId: 'gid://shopify/Product/111',
        minQty: 5,
        percentOff: 14.7,
      },
    ])
  })

  it('requests the nested products connection with a pagination arg', async () => {
    // Regression test: Shopify's schema requires `first` or `last` on every
    // connection field, including the nested `products` connection inside
    // `customerGets.items`, not just the outer `automaticDiscountNodes`.
    // Omitting it here previously passed every mocked test (shopifyQuery is
    // mocked, so the query string is never actually sent to Shopify) but
    // failed against the real API with "you must provide one of first or
    // last" the first time a live "Go live" reconcile ran.
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: { edges: [] },
    })

    await listActualDiscounts()

    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/productsToAdd:\s*products\(first:/))
  })

  it('ignores discounts not created by this app', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/zzz',
              automaticDiscount: { title: 'BFCM 20% off everything' },
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([])
  })

  it('skips a discount node whose type is not DiscountAutomaticBasic, rather than crashing', async () => {
    // Simulates a free-shipping (or other non-Basic) automatic discount in
    // the store: the query's `... on DiscountAutomaticBasic` fragment
    // contributes no fields for a node of a different resolved type, so
    // `automaticDiscount` comes back with no `title` at all — not because a
    // real Basic discount can lack one.
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      automaticDiscountNodes: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DiscountAutomaticNode/free-ship',
              automaticDiscount: {},
            },
          },
        ],
      },
    })

    const result = await listActualDiscounts()
    expect(result).toEqual([])
  })
})

describe('applyActions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates a discount and returns its gid keyed by productId::minQty', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticBasicCreate: {
        automaticDiscountNode: { id: 'gid://shopify/DiscountAutomaticNode/new1' },
        userErrors: [],
      },
    })

    const actions: Action[] = [
      { type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7, title: 'Tiers: Standard — 111 — 5+' },
    ]
    const result = await applyActions(actions)
    expect(result.get('gid://shopify/Product/111::5')).toBe('gid://shopify/DiscountAutomaticNode/new1')
  })

  it('throws if Shopify reports userErrors on create', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticBasicCreate: {
        automaticDiscountNode: null,
        userErrors: [{ field: ['title'], message: 'Title already taken' }],
      },
    })

    const actions: Action[] = [
      { type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7, title: 'Tiers: dup' },
    ]
    await expect(applyActions(actions)).rejects.toThrow('Title already taken')
  })

  it('deletes a discount by id', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticDelete: { userErrors: [] },
    })

    await applyActions([{ type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' }])

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticDelete'),
      expect.objectContaining({ id: 'gid://shopify/DiscountAutomaticNode/aaa' }),
    )
  })
})
