'use server'

import {
  getConfig,
  saveConfig,
  syncProductTiers,
  type TierGroup,
  type Tier,
  type Config,
} from '@/lib/metafields'
import { redirectWithToken } from '@/lib/auth-redirect'
import { randomUUID } from 'crypto'
import { reconcile } from '@/lib/reconciler'
import { listActualDiscounts, applyActions } from '@/lib/shopify-discounts'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfo } from '@/lib/products'

/**
 * Runs the reconciler against `config` and, if it succeeds, applies the
 * resulting Shopify actions, updates discountIds bookkeeping, saves the
 * config, and syncs `group`'s product tier metafields with real
 * per-product prices (never a placeholder). Throws with the reconciler's
 * `reason` on failure (25-discount budget exceeded, or the same
 * product+threshold desired by more than one live group) — nothing is
 * persisted on failure, and the caller is responsible for reverting
 * whatever change it made to `config` before calling this, so a failed
 * attempt never leaves the saved config diverged from real Shopify state.
 *
 * Shared by both `assignProducts` and `setGroupStatus`: editing a live
 * group's product list is exactly as consequential as flipping it live in
 * the first place (it changes what Shopify has real discounts for), so it
 * must go through the identical reconcile-and-apply path rather than only
 * touching config — otherwise the UI could show a product as "live" with
 * a computed price while no discount for it actually exists in Shopify.
 */
async function reconcileAndSync(config: Config, group: TierGroup): Promise<void> {
  const actual = await listActualDiscounts()
  const result = reconcile(config, actual)

  if (!result.ok) {
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

  // Rewrite the denormalised per-product metafield for every product in
  // the group, using each product's REAL base price (Task 9) and
  // tier-math's resultingPrice (Task 6) — never a placeholder. If a
  // product id is stale (getProductInfo returns null — e.g. a deleted
  // product or a typo'd gid pasted into the product list), that single
  // product's metafield sync is skipped rather than failing the whole
  // operation: the discount reconciliation above has already succeeded
  // and is the real pricing engine, so a decorative storefront-widget
  // metafield for one bad id shouldn't roll it back.
  for (const productId of group.productIds) {
    if (group.status === 'live') {
      const info = await getProductInfo(productId)
      if (!info) {
        console.error(`[reconcileAndSync] skipping product tier sync: ${productId} not found`)
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
}

function parseTiersFromForm(formData: FormData): Tier[] {
  const tiers: Tier[] = []
  let i = 0
  while (formData.has(`tier-${i}-minQty`)) {
    const minQty = Number(formData.get(`tier-${i}-minQty`))
    const rawPercentOff = Number(formData.get(`tier-${i}-percentOff`))
    // Round to 1 decimal place — Shopify's stored fraction only round-trips
    // back to 1dp (shopify-discounts.ts's parseDiscount does
    // `Math.round(percentage * 1000) / 10`), so a value with more precision
    // here would never match on the next reconcile, defeating idempotency
    // with a spurious 'update' action every time Go live runs.
    const percentOff = Math.round(rawPercentOff * 10) / 10
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

/**
 * Updates a group's assigned products. If the group is currently live,
 * this re-runs reconciliation immediately — adding a product creates its
 * discount right away, removing one deletes it — reverting the product
 * list on failure so the saved config never diverges from real Shopify
 * state. If the group is draft, this only touches config; reconciliation
 * happens later when the group goes live.
 */
export async function assignProducts(groupId: string, formData: FormData): Promise<void> {
  const productIdsRaw = String(formData.get('productIds') ?? '')
  const productIds = productIdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const previousProductIds = group.productIds
  group.productIds = productIds

  if (group.status === 'live') {
    try {
      await reconcileAndSync(config, group)
    } catch (err) {
      group.productIds = previousProductIds
      throw err
    }
  } else {
    await saveConfig(config)
  }

  await redirectWithToken(`/groups/${groupId}`)
}

/**
 * Flips a group's status and reconciles Shopify's automatic discounts to
 * match. Refuses (throws, leaving the group's prior status in place) if
 * going live would exceed the 25-discount budget or collide with another
 * live group — see reconcile()'s ok:false path.
 */
export async function setGroupStatus(groupId: string, status: 'draft' | 'live'): Promise<void> {
  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)
  if (!group) throw new Error(`Group ${groupId} not found`)

  const previousStatus = group.status
  group.status = status

  try {
    await reconcileAndSync(config, group)
  } catch (err) {
    group.status = previousStatus
    throw err
  }

  await redirectWithToken(`/groups/${groupId}`)
}
