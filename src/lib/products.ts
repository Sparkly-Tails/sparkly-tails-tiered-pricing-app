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

interface RawProductNode {
  id: string
  title: string
  variants: { edges: { node: { price: string } }[] }
}

/**
 * Batched form of getProductInfo: fetches every product in one round-trip
 * via Shopify's `nodes(ids:)` query instead of N single-product queries.
 * Used wherever a whole group's products are previewed or reconciled at
 * once, so a group near its slot ceiling doesn't fire one GraphQL request
 * per product on every page load or save.
 *
 * Returns a Map covering every id in `productIds`, including ones that
 * don't resolve to a real product (deleted product, typo'd gid, or the
 * `... on Product` fragment not matching a differently-typed node) — those
 * map to `null` rather than being silently absent, so callers don't need
 * a separate "was this id even requested" check.
 */
export async function getProductInfoBatch(
  productIds: string[],
): Promise<Map<string, ProductInfo | null>> {
  const result = new Map<string, ProductInfo | null>()
  if (productIds.length === 0) return result

  const data = await shopifyQuery<{
    nodes: (RawProductNode | null)[]
  }>(
    `query getProductInfoBatch($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          variants(first: 1) {
            edges { node { price } }
          }
        }
      }
    }`,
    { ids: productIds },
  )

  for (const node of data.nodes) {
    if (!node) continue
    const firstVariant = node.variants.edges[0]?.node
    result.set(
      node.id,
      firstVariant ? { title: node.title, basePrice: parseFloat(firstVariant.price) } : null,
    )
  }

  // Ensure every requested id has an entry even if Shopify's response
  // omitted it (deleted product, typo'd gid, or a node whose type didn't
  // match the `... on Product` fragment) — callers can then tell "not
  // found" apart from "never asked about" without extra bookkeeping.
  for (const id of productIds) {
    if (!result.has(id)) result.set(id, null)
  }

  return result
}

export interface ProductSearchResult {
  id: string
  title: string
}

/**
 * Search-as-you-type lookup for the "assigned products" picker: returns
 * real product ids (unlike a title-only suggestion list), since the
 * caller needs the gid to add to a group's productIds. Empty/whitespace
 * query short-circuits to no results without a network call, matching
 * the picker's debounce, which only fires once the user has typed enough
 * to search.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    products: { edges: { node: { id: string; title: string } }[] }
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { id title } }
      }
    }`,
    { q: query },
  )

  return data.products.edges.map((e) => e.node)
}
