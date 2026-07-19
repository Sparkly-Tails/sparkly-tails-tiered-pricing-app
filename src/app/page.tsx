import { headers } from 'next/headers'
import { getConfig } from '@/lib/metafields'
import AuthLink from '@/components/AuthLink'

const MAX_ACTIVE_DISCOUNTS = 25

export default async function Home() {
  const token = (await headers()).get('x-auth-token') ?? ''
  const config = await getConfig()

  const slotsUsed = config.groups
    .filter((g) => g.status === 'live')
    .reduce((sum, g) => sum + g.tiers.length * g.productIds.length, 0)

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Tiered Pricing</h1>
        <AuthLink
          href="/groups/new"
          token={token}
          className="bg-black text-white px-4 py-2 rounded"
        >
          New group
        </AuthLink>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} discount slots used
      </p>

      {config.groups.length === 0 ? (
        <p className="text-gray-500">No tier groups yet.</p>
      ) : (
        <ul className="divide-y">
          {config.groups.map((group) => (
            <li key={group.id} className="py-4">
              <AuthLink href={`/groups/${group.id}`} token={token} className="font-medium hover:underline">
                {group.name}
              </AuthLink>
              <p className="text-sm text-gray-500">
                {group.status} · {group.tiers.length} tiers · {group.productIds.length} products
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
