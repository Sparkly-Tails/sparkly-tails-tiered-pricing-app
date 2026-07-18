import { shopifyQuery } from '@/lib/shopify-client'
import { percentageToShopifyFraction } from '@/lib/tier-math'
import type { Action, ActualDiscount } from '@/lib/reconciler'

const TITLE_PREFIX = 'Tiers: '

interface RawDiscountNode {
  id: string
  automaticDiscount: {
    title: string
    minimumRequirement?: { greaterThanOrEqualToQuantity?: string } | null
    customerGets?: {
      value: { percentage?: number }
      items: { products?: { productsToAdd?: string[] } }
    } | null
  }
}

function parseDiscount(node: RawDiscountNode): ActualDiscount | null {
  const { title, minimumRequirement, customerGets } = node.automaticDiscount
  if (!title.startsWith(TITLE_PREFIX)) return null

  const minQty = minimumRequirement?.greaterThanOrEqualToQuantity
  const percentage = customerGets?.value.percentage
  const productId = customerGets?.items.products?.productsToAdd?.[0]

  if (!minQty || percentage === undefined || !productId) return null

  return {
    id: node.id,
    productId,
    minQty: parseInt(minQty, 10),
    percentOff: Math.round(percentage * 1000) / 10, // fraction -> percentage, 1dp
  }
}

/** Fetches all automatic discounts this app manages (identified by title prefix). */
export async function listActualDiscounts(): Promise<ActualDiscount[]> {
  const data = await shopifyQuery<{
    automaticDiscountNodes: { edges: { node: RawDiscountNode }[] }
  }>(
    `query listDiscounts {
      automaticDiscountNodes(first: 250) {
        edges {
          node {
            id
            automaticDiscount {
              ... on DiscountAutomaticBasic {
                title
                minimumRequirement {
                  ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
                }
                customerGets {
                  value { ... on DiscountPercentage { percentage } }
                  items { ... on DiscountProducts { productsToAdd: products { edges { node { id } } } } }
                }
              }
            }
          }
        }
      }
    }`,
  )

  return data.automaticDiscountNodes.edges
    .map((e) => parseDiscount(e.node))
    .filter((d): d is ActualDiscount => d !== null)
}

async function createDiscount(action: Extract<Action, { type: 'create' }>): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticBasicCreate: {
      automaticDiscountNode: { id: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTierDiscount($input: DiscountAutomaticBasicInput!) {
      discountAutomaticBasicCreate(automaticBasicDiscount: $input) {
        automaticDiscountNode { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: action.title,
        startsAt: new Date().toISOString(),
        minimumRequirement: {
          quantity: { greaterThanOrEqualToQuantity: String(action.minQty) },
        },
        customerGets: {
          value: { percentage: percentageToShopifyFraction(action.percentOff) },
          items: { products: { productsToAdd: [action.productId] } },
        },
        combinesWith: {
          productDiscounts: false,
          orderDiscounts: true,
          shippingDiscounts: true,
        },
      },
    },
  )

  const { automaticDiscountNode, userErrors } = data.discountAutomaticBasicCreate
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join('; '))
  }
  return automaticDiscountNode!.id
}

async function updateDiscount(action: Extract<Action, { type: 'update' }>): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticBasicUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTierDiscount($id: ID!, $input: DiscountAutomaticBasicInput!) {
      discountAutomaticBasicUpdate(id: $id, automaticBasicDiscount: $input) {
        userErrors { field message }
      }
    }`,
    {
      id: action.discountId,
      input: {
        customerGets: {
          value: { percentage: percentageToShopifyFraction(action.percentOff) },
        },
      },
    },
  )

  if (data.discountAutomaticBasicUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticBasicUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

async function deleteDiscount(action: Extract<Action, { type: 'delete' }>): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTierDiscount($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: action.discountId },
  )

  if (data.discountAutomaticDelete.userErrors.length > 0) {
    throw new Error(data.discountAutomaticDelete.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * Executes reconciler actions in order. Returns a map of
 * "productId::minQty" -> newly created discount gid, for `create` actions
 * only, so the caller can update Config.groups[].discountIds.
 */
export async function applyActions(actions: Action[]): Promise<Map<string, string>> {
  const created = new Map<string, string>()

  for (const action of actions) {
    if (action.type === 'create') {
      const id = await createDiscount(action)
      created.set(`${action.productId}::${action.minQty}`, id)
    } else if (action.type === 'update') {
      await updateDiscount(action)
    } else {
      await deleteDiscount(action)
    }
  }

  return created
}
