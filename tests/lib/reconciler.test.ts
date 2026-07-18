import { describe, it, expect } from 'vitest'
import { reconcile, type ActualDiscount } from '@/lib/reconciler'
import { standardGroup, configWithOneGroup, emptyConfig } from '../fixtures/groups'
import type { Config } from '@/lib/metafields'

describe('reconcile — creating from scratch', () => {
  it('creates one discount per tier per product when nothing exists yet', () => {
    const result = reconcile(configWithOneGroup, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.actions).toHaveLength(2)
    expect(result.actions).toContainEqual(
      expect.objectContaining({ type: 'create', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 }),
    )
    expect(result.actions).toContainEqual(
      expect.objectContaining({ type: 'create', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 }),
    )
  })

  it('creates nothing for a draft group', () => {
    const draftConfig: Config = {
      groups: [{ ...standardGroup, status: 'draft' }],
    }
    const result = reconcile(draftConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})

describe('reconcile — idempotency', () => {
  it('produces zero actions when actual state already matches desired state', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneGroup, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})

describe('reconcile — updates and deletes', () => {
  it('emits an update when a tier percent changes', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 10.0 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneGroup, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      { type: 'update', discountId: 'gid://shopify/DiscountAutomaticNode/aaa', percentOff: 14.7 },
    ])
  })

  it('deletes a discount whose tier was removed from the group', () => {
    const configWithOneTier: Config = {
      groups: [{ ...standardGroup, tiers: [{ minQty: 5, percentOff: 14.7 }] }],
    }
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configWithOneTier, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual([
      { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
    ])
  })

  it('deletes all discounts for a product removed from its group', () => {
    const configNoProducts: Config = {
      groups: [{ ...standardGroup, productIds: [] }],
    }
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const result = reconcile(configNoProducts, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual(
      expect.arrayContaining([
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' },
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
      ]),
    )
    expect(result.actions).toHaveLength(2)
  })

  it('deletes all discounts for a group that goes from live to draft', () => {
    const actual: ActualDiscount[] = [
      { id: 'gid://shopify/DiscountAutomaticNode/aaa', productId: 'gid://shopify/Product/111', minQty: 5, percentOff: 14.7 },
      { id: 'gid://shopify/DiscountAutomaticNode/bbb', productId: 'gid://shopify/Product/111', minQty: 10, percentOff: 17.6 },
    ]
    const draftConfig: Config = {
      groups: [{ ...standardGroup, status: 'draft' }],
    }
    const result = reconcile(draftConfig, actual)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toEqual(
      expect.arrayContaining([
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/aaa' },
        { type: 'delete', discountId: 'gid://shopify/DiscountAutomaticNode/bbb' },
      ]),
    )
  })
})

describe('reconcile — slot budget', () => {
  it('refuses all-or-nothing when the desired state would exceed 25 discounts', () => {
    // 13 products x 2 tiers = 26 discounts, one over budget
    const manyProductIds = Array.from({ length: 13 }, (_, i) => `gid://shopify/Product/${i}`)
    const overBudgetConfig: Config = {
      groups: [{ ...standardGroup, productIds: manyProductIds }],
    }
    const result = reconcile(overBudgetConfig, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/25/)
  })

  it('allows exactly 25 discounts', () => {
    // 12 products x 2 tiers = 24, plus 1 more product's worth counted
    // separately in a second group with 1 tier = 25 total
    const twelveProducts = Array.from({ length: 12 }, (_, i) => `gid://shopify/Product/${i}`)
    const exactBudgetConfig: Config = {
      groups: [
        { ...standardGroup, productIds: twelveProducts },
        {
          id: 'grp_extra',
          name: 'Extra',
          status: 'live',
          tiers: [{ minQty: 3, percentOff: 5 }],
          productIds: ['gid://shopify/Product/999'],
          discountIds: {},
        },
      ],
    }
    const result = reconcile(exactBudgetConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(25)
  })
})

describe('reconcile — empty config', () => {
  it('produces no actions and no error for an empty config with no actual discounts', () => {
    const result = reconcile(emptyConfig, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.actions).toHaveLength(0)
  })
})
