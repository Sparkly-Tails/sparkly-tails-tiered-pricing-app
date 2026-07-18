import type { Config, TierGroup } from '@/lib/metafields'

export const standardGroup: TierGroup = {
  id: 'grp_standard',
  name: 'Standard voucher',
  status: 'live',
  tiers: [
    { minQty: 5, percentOff: 14.7 },
    { minQty: 10, percentOff: 17.6 },
  ],
  productIds: ['gid://shopify/Product/111'],
  discountIds: {},
}

export const configWithOneGroup: Config = {
  groups: [standardGroup],
}

export const emptyConfig: Config = { groups: [] }
