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
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          New group
        </AuthLink>
      </div>

      <p className="text-sm text-muted mb-6">
        {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} discount slots used
      </p>

      {config.groups.length === 0 ? (
        <p className="text-muted">No tier groups yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {config.groups.map((group) => (
            <li key={group.id} className="py-4">
              <AuthLink href={`/groups/${group.id}`} token={token} className="font-medium hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                {group.name}
              </AuthLink>
              <p className="text-sm text-muted">
                {group.status} · {group.tiers.length} tiers · {group.productIds.length} products
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
