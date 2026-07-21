import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getConfig } from '@/lib/metafields'
import { resultingPrice } from '@/lib/tier-math'
import { getProductInfo } from '@/lib/products'
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

  // Real per-product pricing preview: fetch each assigned product's actual
  // Shopify price (Task 9) so the table below shows the exact resulting
  // price the discount will produce — never an example or placeholder. A
  // stale product id (deleted product, typo) resolves to null and is
  // shown as a visible warning row instead of crashing the page.
  const productPreviews = await Promise.all(
    group.productIds.map(async (productId) => ({
      productId,
      info: await getProductInfo(productId),
    })),
  )

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{group.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {group.status} · {slotsUsed} of {MAX_ACTIVE_DISCOUNTS} store-wide discount slots used
        ({thisGroupSlots} from this group)
      </p>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Tiers</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Min qty</th>
              <th className="py-1">% off</th>
            </tr>
          </thead>
          <tbody>
            {group.tiers.map((tier) => (
              <tr key={tier.minQty} className="border-b">
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
          <p className="text-sm text-gray-500">No products assigned yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Product</th>
                <th className="py-1">Base price</th>
                {group.tiers.map((tier) => (
                  <th key={tier.minQty} className="py-1">{tier.minQty}+</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productPreviews.map(({ productId, info }) => (
                <tr key={productId} className="border-b">
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
                    <td colSpan={2 + group.tiers.length} className="py-1 text-red-600">
                      {productId} — product not found, will be skipped
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
            className="w-full border rounded px-3 py-2 text-sm"
            rows={3}
          />
          <button type="submit" className="bg-gray-200 px-4 py-2 rounded text-sm">
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
            <button type="submit" className="bg-black text-white px-4 py-2 rounded">
              Go live
            </button>
          </ConfirmForm>
        ) : (
          <ConfirmForm
            action={goDraft}
            confirmMessage={`Take "${group.name}" offline? This removes its real Shopify automatic discounts immediately.`}
          >
            <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded">
              Take offline
            </button>
          </ConfirmForm>
        )}
      </section>
    </main>
  )
}
