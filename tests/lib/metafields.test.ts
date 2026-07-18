import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, type Config } from '@/lib/metafields'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an empty config when the metafield does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: null },
    })

    const config = await getConfig()
    expect(config).toEqual({ groups: [] })
  })

  it('parses an existing config metafield', async () => {
    const stored: Config = {
      groups: [
        {
          id: 'grp_1',
          name: 'Standard',
          status: 'live',
          tiers: [{ minQty: 5, percentOff: 14.7 }],
          productIds: ['gid://shopify/Product/1'],
          discountIds: {},
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })

    const config = await getConfig()
    expect(config).toEqual(stored)
  })
})

describe('saveConfig', () => {
  it('writes the config as a JSON metafield via metafieldsSet', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
      .mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
      .mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = { groups: [] }
    await saveConfig(config)

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: expect.arrayContaining([
          expect.objectContaining({
            namespace: 'sparkly_tiers',
            key: 'config',
            type: 'json',
            value: JSON.stringify(config),
          }),
        ]),
      }),
    )
  })

  it('throws if Shopify reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery')
      .mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
      .mockResolvedValueOnce({
        metafieldsSet: { userErrors: [{ field: ['value'], message: 'too long' }] },
      })

    await expect(saveConfig({ groups: [] })).rejects.toThrow('too long')
  })
})
