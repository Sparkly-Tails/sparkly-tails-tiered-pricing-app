'use server'

import { getConfig, saveConfig, type TierGroup, type Tier } from '@/lib/metafields'
import { redirectWithToken } from '@/lib/auth-redirect'
import { randomUUID } from 'crypto'

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
