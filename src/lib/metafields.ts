import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff: number
}

export interface TierGroup {
  id: string
  name: string
  status: 'draft' | 'live'
  tiers: Tier[]
  productIds: string[]
  // productId → threshold (as string, e.g. "5") → DiscountAutomaticNode gid
  discountIds: Record<string, Record<string, string>>
}

export interface Config {
  groups: TierGroup[]
}

const NAMESPACE = 'sparkly_tiers'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { groups: [] }
  }

  return JSON.parse(data.shop.metafield.value) as Config
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}

export interface DenormalisedProductTier {
  groupId: string
  basePrice: string
  tiers: { minQty: number; unitPrice: string }[]
}

/**
 * Rewrites the product's own tier metafield so the storefront widget (a
 * separate Phase 2 project) can render tiers in Liquid with no API call.
 * Called by setGroupStatus (Task 12) after every config change, using the
 * product's real base price (Task 9) and tier-math's resultingPrice (Task 6)
 * to compute basePrice/unitPrice — never a placeholder.
 * Pass `productTiers: null` to clear a product's tiers (e.g. when it's
 * removed from a group).
 */
export async function syncProductTiers(
  productId: string,
  productTiers: DenormalisedProductTier | null,
): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setProductTiers($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'tiers',
          type: 'json',
          value: JSON.stringify(productTiers ?? {}),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}
