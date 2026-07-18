import type { Config, TierGroup } from '@/lib/metafields'

export interface ActualDiscount {
  id: string
  productId: string
  minQty: number
  percentOff: number
}

export type Action =
  | { type: 'create'; productId: string; minQty: number; percentOff: number; title: string }
  | { type: 'delete'; discountId: string }
  | { type: 'update'; discountId: string; percentOff: number }

export type ReconcileResult =
  | { ok: true; actions: Action[] }
  | { ok: false; reason: string }

const MAX_ACTIVE_DISCOUNTS = 25

interface DesiredDiscount {
  productId: string
  minQty: number
  percentOff: number
  title: string
}

function desiredDiscountsForGroup(group: TierGroup): DesiredDiscount[] {
  if (group.status !== 'live') return []

  const desired: DesiredDiscount[] = []
  for (const productId of group.productIds) {
    for (const tier of group.tiers) {
      desired.push({
        productId,
        minQty: tier.minQty,
        percentOff: tier.percentOff,
        title: `Tiers: ${group.name} — ${productId} — ${tier.minQty}+`,
      })
    }
  }
  return desired
}

function key(productId: string, minQty: number): string {
  return `${productId}::${minQty}`
}

/**
 * Diffs the desired config against Shopify's actual automatic discounts and
 * returns the exact set of create/update/delete actions needed to bring
 * Shopify in line. Pure — no Shopify calls. Idempotent: calling this again
 * with `actual` already matching `config` returns an empty action list.
 * All-or-nothing on the 25-discount budget: if the desired state (across
 * every live group) would exceed it, returns { ok: false } with no actions
 * at all, rather than applying some and skipping others.
 */
export function reconcile(config: Config, actual: ActualDiscount[]): ReconcileResult {
  const allDesired = config.groups.flatMap(desiredDiscountsForGroup)

  if (allDesired.length > MAX_ACTIVE_DISCOUNTS) {
    return {
      ok: false,
      reason: `Desired configuration requires ${allDesired.length} automatic discounts, exceeding Shopify's limit of ${MAX_ACTIVE_DISCOUNTS} active discounts per store.`,
    }
  }

  const desiredByKey = new Map(allDesired.map((d) => [key(d.productId, d.minQty), d]))
  const actualByKey = new Map(actual.map((a) => [key(a.productId, a.minQty), a]))

  const actions: Action[] = []

  for (const [k, desired] of desiredByKey) {
    const existing = actualByKey.get(k)
    if (!existing) {
      actions.push({
        type: 'create',
        productId: desired.productId,
        minQty: desired.minQty,
        percentOff: desired.percentOff,
        title: desired.title,
      })
    } else if (existing.percentOff !== desired.percentOff) {
      actions.push({
        type: 'update',
        discountId: existing.id,
        percentOff: desired.percentOff,
      })
    }
  }

  for (const [k, existing] of actualByKey) {
    if (!desiredByKey.has(k)) {
      actions.push({ type: 'delete', discountId: existing.id })
    }
  }

  return { ok: true, actions }
}
