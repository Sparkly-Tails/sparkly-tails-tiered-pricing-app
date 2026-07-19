import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductInfo {
  title: string
  basePrice: number
}

/**
 * Fetches a product's title and real base price (the first variant's
 * price). Assumes a single-variant product — consistent with this app's
 * per-product tier scoping (spec §2.3); multi-variant tiering is out of
 * scope for Phase 1. Returns null if the product doesn't exist or has no
 * variants, so callers (Task 12) can skip a stale product id rather than
 * crash.
 */
export async function getProductInfo(productId: string): Promise<ProductInfo | null> {
  const data = await shopifyQuery<{
    product: {
      title: string
      variants: { edges: { node: { price: string } }[] }
    } | null
  }>(
    `query getProductInfo($id: ID!) {
      product(id: $id) {
        title
        variants(first: 1) {
          edges { node { price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return null
  const firstVariant = data.product.variants.edges[0]?.node
  if (!firstVariant) return null

  return {
    title: data.product.title,
    basePrice: parseFloat(firstVariant.price),
  }
}
