// src/lib/reconciler.ts
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
  groupName: string
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
        groupName: group.name,
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
 *
 * All-or-nothing on two conditions, either of which returns { ok: false }
 * with NO actions at all rather than a partial list:
 *   1. The 25-discount budget (across every live group combined).
 *   2. The same product+threshold desired by more than one live group —
 *      a product's tiers must come from exactly one live group at a time.
 *      Without this check, one group's discount would silently overwrite
 *      the other's in the diff (both map to the same Shopify discount
 *      slot), with no error. Nothing upstream of this function currently
 *      prevents that overlap from being configured, so this is the one
 *      place it's caught.
 *
 * Self-healing extends to duplicate ACTUAL discounts too: if Shopify ever
 * has more than one discount node for the same product+threshold (manual
 * admin tampering, or drift from a past partial failure), every duplicate
 * beyond the first is deleted as an orphan — otherwise it would be
 * permanently invisible to the diff and silently consume the 25-discount
 * budget forever.
 */
export function reconcile(config: Config, actual: ActualDiscount[]): ReconcileResult {
  const allDesired = config.groups.flatMap(desiredDiscountsForGroup)

  const desiredGroupsByKey = new Map<string, DesiredDiscount[]>()
  for (const d of allDesired) {
    const k = key(d.productId, d.minQty)
    const existing = desiredGroupsByKey.get(k)
    if (existing) {
      existing.push(d)
    } else {
      desiredGroupsByKey.set(k, [d])
    }
  }

  for (const entries of desiredGroupsByKey.values()) {
    if (entries.length > 1) {
      const groupNames = [...new Set(entries.map((e) => e.groupName))]
      return {
        ok: false,
        reason: `Product ${entries[0].productId} at ${entries[0].minQty}+ is configured in more than one live group (${groupNames.join(', ')}). A product's tiers must come from exactly one live group at a time.`,
      }
    }
  }

  if (allDesired.length > MAX_ACTIVE_DISCOUNTS) {
    return {
      ok: false,
      reason: `Desired configuration requires ${allDesired.length} automatic discounts, exceeding Shopify's limit of ${MAX_ACTIVE_DISCOUNTS} active discounts per store.`,
    }
  }

  const desiredByKey = new Map(allDesired.map((d) => [key(d.productId, d.minQty), d]))

  const actualGroupsByKey = new Map<string, ActualDiscount[]>()
  for (const a of actual) {
    const k = key(a.productId, a.minQty)
    const existing = actualGroupsByKey.get(k)
    if (existing) {
      existing.push(a)
    } else {
      actualGroupsByKey.set(k, [a])
    }
  }

  const actions: Action[] = []

  for (const [k, desired] of desiredByKey) {
    const existing = actualGroupsByKey.get(k)?.[0]
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

  for (const [k, entries] of actualGroupsByKey) {
    if (!desiredByKey.has(k)) {
      for (const entry of entries) {
        actions.push({ type: 'delete', discountId: entry.id })
      }
    } else if (entries.length > 1) {
      // First entry was already reconciled against desired above; every
      // duplicate beyond it is an orphan.
      for (const orphan of entries.slice(1)) {
        actions.push({ type: 'delete', discountId: orphan.id })
      }
    }
  }

  return { ok: true, actions }
}
