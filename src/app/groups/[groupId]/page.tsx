import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/metafields'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfoBatch } from '@/lib/products'
import { assignProducts, setGroupStatus } from '@/actions/groupActions'
import ConfirmForm from '@/components/ConfirmForm'

const MAX_ACTIVE_DISCOUNTS = 25

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  await headers() // establishes request context for auth token, not used directly on this read-only page yet
  const config = await getConfig()
  const group = config.groups.find((g) => g.id === groupId)

  if (!group) notFound()

  const slotsUsed = config.groups
    .filter((g) => g.status === 'live')
    .reduce((sum, g) => sum + g.tiers.length * g.productIds.length, 0)

  const thisGroupSlots = group.tiers.length * group.productIds.length

  const assignProductsWithId = assignProducts.bind(null, groupId)
  const goLive = setGroupStatus.bind(null, groupId, 'live')
  const goDraft = setGroupStatus.bind(null, groupId, 'draft')

  // Real per-product pricing preview: fetch every assigned product's
  // actual Shopify price in one batched request (Task 9 + impeccable
  // optimize pass) so the table below shows the exact resulting price the
  // discount will produce — never an example or placeholder. A stale
  // product id (deleted product, typo) resolves to null and is shown as a
  // visible warning row instead of crashing the page.
  const productInfoMap = await getProductInfoBatch(group.productIds)
  const productPreviews = group.productIds.map((productId) => ({
    productId,
    info: productInfoMap.get(productId) ?? null,
  }))

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-muted mb-6">
        {group.status} · {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} store-wide discount slots used
        ({thisGroupSlots} from this group)
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-line">
              <th className="py-1">Min qty</th>
              <th className="py-1">% off</th>
            </tr>
          </thead>
          <tbody>
            {group.tiers.map((tier) => (
              <tr key={tier.minQty} className="border-b border-line">
                <td className="py-1">{tier.minQty}+</td>
                <td className="py-1">{tier.percentOff}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Resulting prices by product</h2>
        {productPreviews.length === 0 ? (
          <p className="text-sm text-muted">No products assigned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="py-1">Product</th>
                  <th className="py-1">Base price</th>
                  {group.tiers.map((tier) => (
                    <th key={tier.minQty} className="py-1">{tier.minQty}+</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productPreviews.map(({ productId, info }) => (
                  <tr key={productId} className="border-b border-line">
                    {info ? (
                      <>
                        <td className="py-1">{info.title}</td>
                        <td className="py-1">£{info.basePrice.toFixed(2)}</td>
                        {group.tiers.map((tier) => (
                          <td key={tier.minQty} className="py-1">
                            £{resultingPrice(info.basePrice, tier.percentOff).toFixed(2)}
                          </td>
                        ))}
                      </>
                    ) : (
                      <td colSpan={2 + group.tiers.length} className="py-1 text-danger">
                        {productId} — product not found, will be skipped
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 id="assigned-products-heading" className="font-medium mb-2">Assigned products</h2>
        <form action={assignProductsWithId} className="space-y-2">
          <textarea
            id="productIds"
            name="productIds"
            aria-labelledby="assigned-products-heading"
            defaultValue={group.productIds.join(', ')}
            placeholder="gid://shopify/Product/123, gid://shopify/Product/456"
            className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
            rows={3}
          />
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Save product list
          </button>
        </form>
      </section>

      <section>
        {group.status === 'draft' ? (
          <ConfirmForm
            action={goLive}
            confirmMessage={`Go live with "${group.name}"? This creates real Shopify automatic discounts for ${group.productIds.length} product${group.productIds.length === 1 ? '' : 's'} immediately.`}
          >
            <button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Go live
            </button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={goDraft}
            confirmMessage={`Take "${group.name}" offline? This removes its real Shopify automatic discounts immediately.`}
          >
            <button type="submit" className="bg-danger hover:bg-danger-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
              Take offline
            </button>
          </ConfirmForm>
        )}
      </section>
    </main>
  )
}
