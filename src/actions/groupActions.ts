'use server'

import {
  getConfig,
  saveConfig,
  syncProductTiers,
  type TierGroup,
  type Tier,
} from '@/lib/metafields'
import { redirectWithToken } from '@/lib/auth-redirect'
import { randomUUID } from 'crypto'
import { reconcile } from '@/lib/reconciler'
import { listActualDiscounts, applyActions } from '@/lib/shopify-discounts'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfo } from '@/lib/products'

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const percentOff = Number(formData.get(`tier-${i}-percentOff`))
    if (minQty > 0 && percentOff >= 0) {
      tiers.push({ minQty, percentOff })
    }
    i++
  }
  return tiers.sort((a, b) => a.minQty - b.minQty)
}

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Group name is required')

  const tiers = parseTiersFromForm(formData)
  if (tiers.length === 0) throw new Error('At least one tier is required')

  const config = await getConfig()

  const newGroup: TierGroup = {
    id: `grp_${randomUUID()}`,
    name,
    status: 'draft',
    tiers,
    productIds: [],
    discountIds: {},
  }

  await saveConfig({ groups: [...config.groups, newGroup] })

  await redirectWithToken(`/groups/${newGroup.id}`)
}

export async function assignProducts(groupId: string, formData: FormData): Promise<void> {
  const productIdsRaw = String(formData.get('productIds') ?? '')
  const productIds = productIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  group.productIds = productIds
  await saveConfig(config)

  await redirectWithToken(`/groups/${groupId}`)
}

/**
 * Flips a group's status and reconciles Shopify's automatic discounts to
 * match. This is the only place reconciliation runs. Refuses (throws,
 * leaving the group's prior status in place) if going live would exceed
 * the 25-discount budget — see reconcile()'s ok:false path.
 */
export async function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const previousStatus = group.status
  group.status = status

  const actual = await listActualDiscounts()
  const result = reconcile(config, actual)

  if (!result.ok) {
    group.status = previousStatus
    throw new Error(result.reason)
  }

  const createdIds = await applyActions(result.actions)

  // Update discountIds for every product in every group with the newly
  // created discount gids, and remove entries for anything deleted.
  const deletedIds = new Set(
    result.actions.filter((a) => a.type === 'delete').map((a) => a.discountId),
  )
  for (const g of config.groups) {
    for (const productId of Object.keys(g.discountIds)) {
      for (const minQty of Object.keys(g.discountIds[productId])) {
        if (deletedIds.has(g.discountIds[productId][minQty])) {
          delete g.discountIds[productId][minQty]
        }
      }
    }
  }
  for (const [k, discountId] of createdIds) {
    const [productId, minQtyStr] = k.split('::')
    const targetGroup = config.groups.find((g) => g.productIds.includes(productId))
    if (targetGroup) {
      targetGroup.discountIds[productId] ??= {}
      targetGroup.discountIds[productId][minQtyStr] = discountId
    }
  }

  await saveConfig(config)

  // Rewrite the denormalised per-product metafield for every product
  // touched by this status change, using each product's REAL base price
  // (Task 9) and tier-math's resultingPrice (Task 6) — never a
  // placeholder. If a product id is stale (getProductInfo returns null —
  // e.g. a deleted product or a typo'd gid pasted into the product list),
  // that single product's metafield sync is skipped rather than failing
  // the whole operation: the discount reconciliation above has already
  // succeeded and is the real pricing engine, so a decorative
  // storefront-widget metafield for one bad id shouldn't roll it back.
  for (const productId of group.productIds) {
    if (group.status === 'live') {
      const info = await getProductInfo(productId)
      if (!info) {
        console.error(`[setGroupStatus] skipping product tier sync: ${productId} not found`)
        continue
      }
      await syncProductTiers(productId, {
        groupId: group.id,
        basePrice: info.basePrice.toFixed(2),
        tiers: group.tiers.map((t) => ({
          minQty: t.minQty,
          unitPrice: resultingPrice(info.basePrice, t.percentOff).toFixed(2),
        })),
      })
    } else {
      await syncProductTiers(productId, null)
    }
  }

  await redirectWithToken(`/groups/${groupId}`)
}
