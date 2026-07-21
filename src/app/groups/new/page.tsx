import { createGroup } from '@/actions/groupActions'

export default function NewGroupPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New tier group</h1>

      <form action={createGroup} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Standard voucher"
            className="w-full border border-line rounded px-3 py-2"
          />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <label htmlFor={`tier-${i}-minQty`} className="sr-only">
                  Tier {i + 1} minimum quantity
                </label>
                <input
                  id={`tier-${i}-minQty`}
                  name={`tier-${i}-minQty`}
                  type="number"
                  min="1"
                  placeholder="Min qty (e.g. 5)"
                  className="border border-line rounded px-3 py-2 w-40"
                />
                <span className="text-sm text-muted">+ units →</span>
                <label htmlFor={`tier-${i}-percentOff`} className="sr-only">
                  Tier {i + 1} percent off
                </label>
                <input
                  id={`tier-${i}-percentOff`}
                  name={`tier-${i}-percentOff`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="% off (e.g. 14.7)"
                  className="border border-line rounded px-3 py-2 w-40"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price for each assigned product before you save.
          </p>
        </div>

        <button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded">
          Create draft group
        </button>
      </form>
    </main>
  )
}
